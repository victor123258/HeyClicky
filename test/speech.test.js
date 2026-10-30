const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { Speech } = require('../src/main/speech');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(options) {
  const children = [], killed = [], launches = [], events = [];
  const native = {
    launch: (...args) => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); children.push(child); launches.push(args); return child; },
    kill: child => { if (child) killed.push(child); },
    collect: async () => '{"languages":[],"defaultLanguage":"en-US"}'
  };
  const speech = new Speech(native, options);
  const listen = (mode = 'talk', language = '') => speech.listen(mode, text => events.push(['text',text]), status => events.push(['ready',status.language]), err => events.push(['error',err.message]), result => events.push(['end',result.ok]), language);
  return { speech, listen, children, killed, launches, events };
}
function send(child, value) { child.stdout.write(JSON.stringify(value)+'\r\n'); }
test('speech protocol handles split UTF-8, BOM, CRLF and un-terminated final line', () => {
  const s=setup();s.listen();const child=s.children[0];
  child.stdout.write('\uFEFF{"type":"ready","language":"en-US"}\r\n');
  const bytes=Buffer.from('{"type":"text","text":"বাংলা café"}');
  for(const byte of bytes)child.stdout.write(Buffer.from([byte]));
  child.emit('close',0);
  assert.deepEqual(s.events,[['ready','en-US'],['text','বাংলা café'],['end',true]]);
  s.speech.stop();
});
test('text arrives before closure; successful completion waits for microphone disposal',()=>{
  const s=setup();s.listen();const c=s.children[0];send(c,{type:'ready'});send(c,{type:'text',text:'My question'});
  assert.equal(s.events.some(e=>e[0]==='end'),false);assert.equal(s.killed.length,0);
  c.emit('close',0);assert.deepEqual(s.events.at(-1),['end',true]);
});
test('empty successful turn shows actionable no-speech error',()=>{
  const s=setup();s.listen();const c=s.children[0];send(c,{type:'ready'});send(c,{type:'empty'});c.emit('close',0);
  assert.match(s.events.find(e=>e[0]==='error')[1],/No speech heard/);assert.deepEqual(s.events.at(-1),['end',false]);
});
test('startup hang is bounded and terminates helper',async()=>{
  const s=setup({startupTimeout:10});s.listen();await wait(30);
  assert.match(s.events[0][1],/startup timed out/);assert.deepEqual(s.events.at(-1),['end',false]);assert.equal(s.killed.length,1);
});
test('ready but stuck recognizer times out',async()=>{
  const s=setup({startupTimeout:100,turnTimeout:10});s.listen();send(s.children[0],{type:'ready'});await wait(30);
  assert.match(s.events.find(e=>e[0]==='error')[1],/No completed speech/);assert.equal(s.killed.length,1);
});
test('protocol failure reported once; late close/output ignored',()=>{
  const s=setup();s.listen();const c=s.children[0];send(c,{type:'error',text:'No installed recognizer'});send(c,{type:'text',text:'stale'});c.emit('close',1);
  assert.deepEqual(s.events,[['error','No installed recognizer'],['end',false]]);assert.equal(s.killed.length,1);
});
test('stop and restart suppress stale events from the previous microphone',()=>{
  const s=setup();s.listen();const old=s.children[0];s.speech.stop();s.listen('agent');
  send(old,{type:'text',text:'old question'});old.emit('close',0);
  const c=s.children[1];send(c,{type:'ready',language:'en-GB'});send(c,{type:'text',text:'new task'});c.emit('close',0);
  assert.deepEqual(s.events,[['ready','en-GB'],['text','new task'],['end',true]]);assert.ok(s.killed.includes(old));
});
test('dictation emits multiple chunks without a turn timeout',async()=>{
  const s=setup({turnTimeout:10});s.listen('dictate');const c=s.children[0];send(c,{type:'ready'});send(c,{type:'text',text:'one'});await wait(30);send(c,{type:'text',text:'two'});
  assert.equal(s.events.filter(e=>e[0]==='text').length,2);assert.equal(s.events.some(e=>e[0]==='end'),false);s.speech.stop();
});
test('stderr is consumed and nonzero exit after text is not accepted as success',()=>{
  const s=setup();s.listen();const c=s.children[0];send(c,{type:'ready'});send(c,{type:'text',text:'incomplete'});c.stderr.write('native failure');c.emit('close',1);
  assert.deepEqual(s.events.at(-1),['end',false]);assert.match(s.events.find(e=>e[0]==='error')[1],/unexpectedly/);
});
test('spawn failure and exit before readiness return to idle once',()=>{
  const s=setup();s.listen();const c=s.children[0];c.emit('error',Error('ENOENT'));c.emit('close',1);
  assert.equal(s.events.filter(e=>e[0]==='error').length,1);assert.equal(s.events.filter(e=>e[0]==='end').length,1);
  s.listen();s.children[1].emit('close',0);assert.match(s.events.at(-2)[1],/did not initialize/);
});
test('selected recognition language is sent separately from output voice',()=>{
  const s=setup();s.listen('test','en-GB');assert.deepEqual(s.launches[0],['listen.ps1',['-Mode','test','-Culture','en-GB']]);s.speech.stop();
});
test('diagnostics use non-recording recognizer enumeration mode',async()=>{
  const s=setup();const report=await s.speech.diagnostics();assert.deepEqual(report.languages,[]);assert.deepEqual(s.launches[0],['listen.ps1',['-Mode','probe']]);
});
test('held speech streams partials and real levels, and submits only on explicit release',()=>{
 const s=setup();const partials=[],levels=[];
 s.speech.listen('talk',text=>s.events.push(['text',text]),()=>{},e=>{throw e;},result=>s.events.push(['end',result.ok]),'en-US',{held:true,onPartial:t=>partials.push(t),onLevel:n=>levels.push(n)});
 const c=s.children[0];c.stdin=new PassThrough();let input='';c.stdin.on('data',b=>input+=b.toString());
 send(c,{type:'ready'});send(c,{type:'partial',text:'A partial question'});send(c,{type:'level',level:62});assert.equal(s.events.length,0);assert.deepEqual(partials,['A partial question']);assert.deepEqual(levels,[62]);
 s.speech.finishListening();assert.equal(JSON.parse(input).action,'finish');assert.equal(s.launches[0][0],'hold-speech.ps1');assert.equal(s.launches[0][3].keepStdin,true);
 send(c,{type:'text',text:'A final question'});c.emit('close',0);assert.deepEqual(s.events,[['text','A final question'],['end',true]]);
});
