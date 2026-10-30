const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../src/renderer');
const wait=()=>new Promise(resolve=>setTimeout(resolve,10));
async function setup() {
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only',url:'http://preview/'});
 dom.window.eval(fs.readFileSync(path.join(root,'demo.js'),'utf8'));
 dom.window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
 await wait();return dom;
}
test('preview initializes visibly and navigates all sections',async()=>{
 const dom=await setup();try {const d=dom.window.document;
 assert.equal(d.querySelector('#demo-banner').hidden,false);
 for(const view of ['activity','shortcuts','privacy','settings','chat']) {
 d.querySelector(`[data-view="${view}"]`).click();assert.equal(d.querySelector(`#view-${view}`).hidden,false);
 }
 assert.equal(d.querySelectorAll('.shortcut-row').length,5);
 }finally{dom.window.close();}
});
test('settings save updates model without storing a real key in preview',async()=>{
 const dom=await setup();try {const d=dom.window.document;
 d.querySelector('#model').value='openai/gpt-4.1';d.querySelector('#settings-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await wait();
 assert.equal(d.querySelector('#model-label').textContent,'openai/gpt-4.1');assert.match(d.querySelector('#save-result').textContent,/saved/);
 d.querySelector('#api-key').value='real-key';d.querySelector('#settings-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await wait();assert.match(d.querySelector('#toast').textContent,/Do not enter a real API key/);
 }finally{dom.window.close();}
});
test('messages are rendered as text, not HTML; clear resets conversation',async()=>{
 const dom=await setup();try {const d=dom.window.document;
 d.querySelector('#prompt').value='<img src=x onerror=alert(1)>';d.querySelector('#composer').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await wait();
 assert.equal(d.querySelector('.message-text').textContent,'<img src=x onerror=alert(1)>');assert.equal(d.querySelectorAll('#messages img').length,0);
 d.querySelector('#clear').click();await wait();assert.equal(d.querySelectorAll('.message').length,0);assert.equal(d.querySelector('#welcome').hidden,false);assert.equal(d.querySelector('#send').disabled,false);
 }finally{dom.window.close();}
});
test('agent card changes mode; context toggle persists',async()=>{
 const dom=await setup();try {const d=dom.window.document;
 d.querySelector('[data-agent-card]').click();assert.equal(d.querySelector('[data-mode="agent"]').classList.contains('selected'),true);
 const checkbox=d.querySelector('#screen-context');checkbox.checked=false;checkbox.dispatchEvent(new dom.window.Event('change'));await wait();assert.match(d.querySelector('#context-hint').textContent,/Text only/);
 }finally{dom.window.close();}
});
test('notch UI only exposes quick actions, escapes response text and stops busy tasks',async()=>{
 const calls=[];let listener;
 const dom=new JSDOM(fs.readFileSync(path.join(root,'notch.html'),'utf8'),{runScripts:'outside-only',url:'http://preview/notch.html'});
 try {
 dom.window.notch={get:async()=>({state:'idle',expanded:false}),onEvent:fn=>listener=fn,action:async name=>calls.push(name),expand:async value=>calls.push(value)};
 dom.window.eval(fs.readFileSync(path.join(root,'notch.js'),'utf8'));await wait();const d=dom.window.document;
 assert.equal(d.querySelector('#details').hidden,true);d.querySelector('#expand').click();await wait();assert.equal(calls.at(-1),true);
 listener({state:'listening',expanded:true,preview:'<img onerror=bad()>',kind:'transcript'});
 assert.equal(d.querySelector('#details').hidden,false);assert.equal(d.querySelector('#preview img'),null);assert.equal(d.querySelector('[data-action="agent"]').disabled,true);
 d.querySelector('#quick-talk').click();await wait();assert.equal(calls.at(-1),'stop');
 listener({state:'idle',expanded:true});d.querySelector('[data-action="talk"]').click();await wait();assert.equal(calls.at(-1),'talk');
 }finally{dom.window.close();}
});
test('microphone test renders recognized text locally, with no AI call',async()=>{
 let listener;const calls=[];
 const defaults=require('../src/main/lib/settings').validate({});
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only',url:'http://preview/'});
 try {
 dom.window.clicky={onEvent:fn=>listener=fn,call:async(name,...args)=>{
 calls.push(name);
 if(name==='get-settings')return {ok:true,data:{...defaults,hasKey:false,state:'idle'}};
 if(name==='voice-test') {listener({type:'state',data:'listening'});listener({type:'voice-ready',data:{language:'en-US',test:true}});listener({type:'voice-heard',data:'Testing my microphone'});listener({type:'state',data:'idle'});listener({type:'voice-test-result',data:'Testing my microphone'});}
 if(name==='speech-diagnostics')return {ok:true,data:{languages:[{id:'en-US',name:'English'}]}};
 return {ok:true};
 }};
 dom.window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));await wait();const d=dom.window.document;
 d.querySelector('#voice-test').click();await wait();assert.match(d.querySelector('#microphone-result').textContent,/complete.*Testing my microphone/);assert.equal(calls.includes('ask'),false);assert.equal(d.querySelector('#voice-test').disabled,false);
 d.querySelector('#speech-diagnostics').click();await wait();assert.equal(d.querySelector('#speech-language').options.length,2);
 }finally{dom.window.close();}
});
test('standalone notch browser preview does not mistake the DOM id for a preload API',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'notch.html'),'utf8'),{runScripts:'outside-only',url:'http://preview/notch.html'});
 try {
 dom.window.eval(fs.readFileSync(path.join(root,'notch.js'),'utf8'));await wait();const d=dom.window.document;
 assert.equal(d.body.classList.contains('preview-page'),true);assert.equal(d.querySelector('#details').hidden,false);
 d.querySelector('[data-action="talk"]').click();await wait();assert.match(d.querySelector('#preview').textContent,/Windows app only/);
 d.querySelector('#collapse').click();await wait();assert.equal(d.querySelector('#details').hidden,true);
 }finally{dom.window.close();}
});
