const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { notchBounds } = require('../src/main/lib/notch-layout');
const { Notch } = require('../src/main/notch');
function setup() {
  const display={ workArea:{x:-1920,y:30,width:1920,height:1050} };
  class Window {
    constructor(options) { this.options=options;this.webContents=new EventEmitter();this.messages=[];this.webContents.send=(...args)=>this.messages.push(args);this.webContents.setWindowOpenHandler=fn=>this.open=fn; }
    setAlwaysOnTop(){} setContentProtection(value){this.protected=value;} loadFile(){} isDestroyed(){return false;}
    setBounds(bounds){this.bounds=bounds;} showInactive(){this.visible=true;} hide(){this.visible=false;} destroy(){}
  }
  const notch=new Notch({BrowserWindow:Window,screen:{getPrimaryDisplay:()=>display}});
  return {notch,win:notch.window,display};
}
test('notch is centered in available area on negative-coordinate display',()=>{
  const d={workArea:{x:-1920,y:30,width:1920,height:1050}};
  assert.deepEqual(notchBounds(d,false),{x:-1074,y:30,width:228,height:44});
  assert.deepEqual(notchBounds(d,true),{x:-1164,y:30,width:408,height:216});
});
test('bounds are clamped on small displays',()=>{assert.deepEqual(notchBounds({bounds:{x:0,y:0,width:200,height:100}},true),{x:0,y:0,width:200,height:100});});
test('notch cannot steal typing focus, spawn browser windows or run Node',()=>{
  const {win}=setup();assert.equal(win.options.focusable,false);assert.equal(win.options.webPreferences.sandbox,true);assert.equal(win.options.webPreferences.nodeIntegration,false);assert.equal(win.protected,true);assert.deepEqual(win.open(),{action:'deny'});
});
test('collapsed native window shrinks instead of covering invisible screen space',()=>{
  const {notch,win}=setup();notch.expand(true);assert.equal(win.bounds.height,216);notch.expand(false);assert.equal(win.bounds.height,44);assert.equal(win.bounds.width,228);
});
test('state, errors, transcript and settings update the notch',()=>{
  const {notch,win}=setup();notch.setState('listening');assert.equal(notch.snapshot().expanded,true);notch.message('Heard: hello','transcript');assert.equal(notch.snapshot().preview,'Heard: hello');
  notch.setEnabled(false);assert.equal(win.visible,false);notch.setState('thinking');assert.equal(win.visible,false);notch.setEnabled(true);assert.equal(win.visible,true);
  notch.message('Microphone unavailable','error');assert.equal(notch.snapshot().kind,'error');notch.clear();assert.equal(notch.snapshot().preview,'');
});
test('capture suspension survives state updates and display changes',()=>{
  const {notch,win,display}=setup();notch.suspend(true);notch.setState('thinking');display.workArea.x=0;notch.render();assert.equal(win.visible,false);assert.equal(win.bounds.x,756);notch.suspend(false);assert.equal(win.visible,true);
});
test('overlapping capture/input suspensions cannot restore the notch prematurely',()=>{
 const {notch,win}=setup();notch.suspend(true);notch.suspend(true);notch.suspend(false);assert.equal(win.visible,false);notch.suspend(false);assert.equal(win.visible,true);
});
