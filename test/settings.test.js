const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate, Settings, DEFAULTS } = require('../src/main/lib/settings');
test('defaults are valid and partial hotkeys merge', () => {
  assert.equal(validate({}).model, 'openai/gpt-4.1-mini');
  assert.equal(validate({ hotkeys: { talk: 'Ctrl+Alt+T' } }).hotkeys.stop, DEFAULTS.hotkeys.stop);
});
for (const [name, input] of Object.entries({ model: { model: 'https://bad' }, rate: { rate: 8 }, boolean: { buddy: 'true' }, voice: {voice:123}, duplicate: {hotkeys:{talk:DEFAULTS.hotkeys.agent}}, key: {hotkeys:{stop:'Escape'}} })) {
  test(`rejects invalid setting: ${name}`, () => assert.throws(() => validate(input)));
}
test('API key encrypted at rest and never exposed to renderer', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clicky-'));
  const crypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
  try {
    const settings=new Settings(dir,crypto); settings.save({},'sk-private-value');
    assert.equal(settings.public().hasKey,true);
    assert.equal(JSON.stringify(settings.public()).includes('sk-private-value'),false);
    assert.equal(fs.readFileSync(settings.file,'utf8').includes('sk-private-value'),false);
    const restored=new Settings(dir,crypto); assert.equal(restored.key,'sk-private-value');
    restored.save({model:'openai/gpt-4.1'}); assert.equal(restored.key,'sk-private-value');
    restored.delete(); assert.equal(restored.public().hasKey,false); assert.equal(fs.existsSync(restored.file),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('encryption unavailable fails closed', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clicky-'));
  try {
    const s=new Settings(dir,{isEncryptionAvailable:()=>false});
    assert.throws(()=>s.save({},'secret'),/encryption unavailable/);
    assert.equal(fs.existsSync(s.file),false); assert.equal(s.key,'');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('corrupt settings give recoverable warning',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clicky-'));
  try {fs.writeFileSync(path.join(dir,'settings.json'),'{bad');const s=new Settings(dir,{});assert.ok(s.public().loadError);assert.equal(s.key,'');}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('legacy preferences gain notch and automatic recognition-language defaults',()=>{
  const value=validate({model:'openai/gpt-4.1'});assert.equal(value.notch,true);assert.equal(value.speechLanguage,'');
  assert.equal(validate({speechLanguage:'en-US',notch:false}).speechLanguage,'en-US');
  assert.throws(()=>validate({speechLanguage:'en; bad-command'}));assert.throws(()=>validate({notch:'yes'}));
});
test('Hidden Edge window is an explicit preference, not a silent migration',()=>{
  assert.equal(validate({}).edgeWindowMode,'minimized');assert.equal(validate({edgeWindowMode:'hidden'}).edgeWindowMode,'hidden');assert.throws(()=>validate({edgeWindowMode:'headless'}));assert.equal(validate({edgeWindowMode:'hidden'}).edgeBackground,false);
});
