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
