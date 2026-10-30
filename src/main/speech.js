const { StringDecoder } = require('node:string_decoder');

class Speech {
  constructor(driver, { startupTimeout = 20000, turnTimeout = 90000 } = {}) {
    // Injection makes native lifecycle/cancellation regression tests possible off Windows.
    this.native = driver || require('./native');
    this.startupTimeout = startupTimeout;
    this.turnTimeout = turnTimeout;
    this.listener = null;
    this.speaker = null;
  }
  stopListening() {
    const session = this.listener;
    if (!session) return;
    this.listener = null;
    session.cancel();
    this.native.kill(session.child);
  }
  stop() {
    this.stopListening();
    this.native.kill(this.speaker);
    this.speaker = null;
  }
  listen(mode, onText, onStatus, onError, onEnd, language = '') {
    this.stop();
    const child = this.native.launch('listen.ps1', ['-Mode', mode, ...(language ? ['-Culture', language] : [])]);
    const decoder = new StringDecoder('utf8');
    let pending = '', gotText = false, ready = false, stderr = '', ended = false, timer;
    const session = { child, cancel: () => { ended = true; clearTimeout(timer); } };
    this.listener = session;
    const current = () => !ended && this.listener === session;
    const finish = (err, terminate = false) => {
      if (!current()) return;
      ended = true; clearTimeout(timer); this.listener = null;
      if (terminate) this.native.kill(child);
      // Callback exceptions are NOT swallowed as malformed JSON.
      try { if (err) onError(err); }
      finally { onEnd({ ok: !err }); }
    };
    const armTimeout = (ms, message) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(Error(message), true), ms);
      timer.unref?.();
    };
    const line = raw => {
      if (!current() || !raw.trim()) return;
      let event;
      try { event = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { return; }
      if (event.type === 'ready') {
        ready = true; clearTimeout(timer);
        if (mode !== 'dictate') armTimeout(this.turnTimeout, 'No completed speech received. Check the default microphone and try a shorter question.');
        onStatus(event);
      } else if (event.type === 'text' && typeof event.text === 'string' && event.text.trim()) {
        gotText = true; onText(event.text.trim());
      } else if (event.type === 'error') {
        finish(Error(typeof event.text === 'string' ? event.text : 'Windows speech failed.'), true);
      }
    };
    const drain = () => {
      let index;
      while (current() && (index = pending.indexOf('\n')) >= 0) {
        const raw = pending.slice(0, index); pending = pending.slice(index + 1); line(raw);
      }
      if (pending.length > 65536) finish(Error('Invalid speech helper output.'), true);
    };
    armTimeout(this.startupTimeout, 'Microphone startup timed out. Check Windows microphone access for desktop apps and install a speech recognition language pack.');
    child.stdout.on('data', chunk => { if (current()) { pending += decoder.write(chunk); drain(); } });
    // Drain stderr too: an unread stderr pipe can stall a failing PowerShell process.
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-2000); });
    child.on('error', err => finish(Error(`Could not start Windows speech: ${err.message}`)));
    child.on('close', code => {
      if (!current()) return;
      pending += decoder.end(); drain();
      if (pending.trim()) line(pending);
      if (!current()) return;
      if (code !== 0) finish(Error(`Windows speech exited unexpectedly. ${stderr ? 'Check your speech language pack, microphone permissions, and Windows PowerShell policy.' : 'Try the microphone test in Settings.'}`));
      else if (!ready) finish(Error('Windows speech did not initialize. Check your speech recognition language pack.'));
      else if (!gotText && mode !== 'dictate') finish(Error('No speech heard. Wait for “Listening”, then speak into the Windows default microphone.'));
      else finish();
    });
  }
  async diagnostics() {
    const data = await this.native.collect(this.native.launch('listen.ps1', ['-Mode', 'probe']));
    return JSON.parse(data);
  }
  async speak(text, settings, signal) {
    this.native.kill(this.speaker);
    const child = this.speaker = this.native.launch('speak.ps1', [], { text: text.slice(0, 10000), voice: settings.voice, rate: settings.rate });
    try { await this.native.collect(child, signal, 240000); }
    finally { if (this.speaker === child) this.speaker = null; }
  }
  async voices() { return JSON.parse(await this.native.collect(this.native.launch('speak.ps1', [], { action: 'voices' }))); }
}
module.exports = { Speech };
