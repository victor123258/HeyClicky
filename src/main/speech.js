const native = require('./native');
const { StringDecoder } = require('node:string_decoder');
class Speech {
  constructor() { this.listener = null; this.speaker = null; }
  stop() { native.kill(this.listener); native.kill(this.speaker); this.listener = null; this.speaker = null; }
  listen(mode, onText, onStatus, onError, onEnd) {
    this.stop();
    const child = this.listener = native.launch('listen.ps1', ['-Mode', mode]);
    const decoder = new StringDecoder('utf8');
    let pending = '', gotText = false, reported = false;
    child.stdout.on('data', chunk => {
      if (this.listener !== child) return;
      pending += decoder.write(chunk);
      let idx;
      while ((idx = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, idx).trim(); pending = pending.slice(idx + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'ready') onStatus();
          if (event.type === 'text') { gotText = true; onText(event.text); }
          if (event.type === 'error') { reported = true; onError(Error(event.text)); }
        } catch { /* Ignore non-protocol output. */ }
      }
    });
    child.on('error', error => { if (this.listener === child) { reported = true; onError(error); } });
    child.on('close', code => {
      if (this.listener !== child) return;
      this.listener = null;
      if (code && !reported) onError(Error('Windows speech failed. Check your speech language pack and microphone.'));
      else if (!gotText && mode !== 'dictate' && !reported) onError(Error('No speech heard. Try again.'));
      onEnd();
    });
  }
  async speak(text, settings, signal) {
    native.kill(this.speaker);
    const child = this.speaker = native.launch('speak.ps1', [], { text: text.slice(0, 10000), voice: settings.voice, rate: settings.rate });
    try { await native.collect(child, signal, 240000); }
    finally { if (this.speaker === child) this.speaker = null; }
  }
  async voices() { return JSON.parse(await native.collect(native.launch('speak.ps1', [], { action: 'voices' }))); }
}
module.exports = { Speech };
