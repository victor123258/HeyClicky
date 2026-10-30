const {test}=require('node:test');const assert=require('node:assert/strict');
const {tools,validateTool,needsApproval}=require('../src/main/lib/tools');
test('all tools have strict schemas',()=>{assert.equal(tools.length,10);for(const t of tools)assert.equal(t.function.parameters.additionalProperties,false);});
test('coordinates are normalized and finite',()=>{
  assert.deepEqual(validateTool('click',{x:0,y:1000,button:'left'}),{x:0,y:1000,button:'left'});
  for(const x of [-1,1001,NaN,Infinity,'500'])assert.throws(()=>validateTool('click',{x,y:2,button:'left'}));
});
test('missing, extra, unknown or oversized args rejected',()=>{
  assert.throws(()=>validateTool('click',{x:1,y:2}));assert.throws(()=>validateTool('screenshot',{unexpected:true}));
  assert.throws(()=>validateTool('evil',{}));assert.throws(()=>validateTool('type_text',{text:'a'.repeat(8001)}));
  assert.throws(()=>validateTool('type_text',{text:'a\0b'}));
});
test('reject executable links, credentials and insecure fetching',()=>{
  for(const url of ['file:///C:/Windows','javascript:alert(1)','https://user:pass@example.com','http://example.com'])assert.throws(()=>validateTool('fetch_url',{url}));
  assert.equal(validateTool('fetch_url',{url:'https://example.com'}).url,'https://example.com');
});
test('file paths must be absolute',()=>{
  assert.throws(()=>validateTool('read_file',{path:'relative.txt'}));
  assert.equal(validateTool('read_file',{path:'C:\\Users\\me\\test.txt'}).path,'C:\\Users\\me\\test.txt');
});
test('approvals cannot be disabled for commands, data access or external URLs',()=>{
  for(const tool of ['powershell','write_file','read_file','fetch_url','open_url'])assert.equal(needsApproval(tool,false),true);
  for(const tool of ['click','type_text','press_keys']){assert.equal(needsApproval(tool),true);assert.equal(needsApproval(tool,false),false);}
  assert.equal(needsApproval('screenshot'),false);assert.equal(needsApproval('draw'),false);
});
