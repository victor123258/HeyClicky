const fs = require('node:fs');
const path = require('node:path');
const DEFAULTS = Object.freeze({ model: 'openai/gpt-4.1-mini', voice: '', speechLanguage: '', notch: true, captions: true, rate: 0, askBeforeActions: true, buddy: true, screenContext: true, speak: true, startWithWindows: false, hotkeys: { talk: 'CommandOrControl+Shift+Space', agent: 'CommandOrControl+Shift+A', dictate: 'CommandOrControl+Shift+D', panel: 'CommandOrControl+Shift+H', stop: 'CommandOrControl+Shift+X' } });
function validate(input) {
  const s = { ...DEFAULTS, ...input, hotkeys: { ...DEFAULTS.hotkeys, ...input.hotkeys } };
  if (typeof s.model !== 'string' || !/^[\w.-]+\/[\w.\-:/]+$/.test(s.model) || s.model.length > 150) throw Error('Enter a valid provider/model ID.');
  if (typeof s.voice !== 'string' || s.voice.length > 200) throw Error('Invalid voice.');
  if (typeof s.speechLanguage !== 'string' || (s.speechLanguage && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){1,3}$/.test(s.speechLanguage))) throw Error('Choose a valid speech recognition language.');
  if (!Number.isInteger(s.rate) || s.rate < -5 || s.rate > 5) throw Error('Voice rate must be between -5 and 5.');
  for (const k of ['askBeforeActions', 'buddy', 'screenContext', 'speak', 'startWithWindows', 'notch', 'captions']) if (typeof s[k] !== 'boolean') throw Error(`Invalid ${k}`);
  const keys = Object.keys(DEFAULTS.hotkeys).map(k => s.hotkeys[k]);
  if (keys.some(k => typeof k !== 'string' || k.length > 80 || !k.includes('+')) || new Set(keys.map(k => k.toLowerCase())).size !== keys.length) throw Error('Hotkeys must be unique key combinations.');
  return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, s[k]]));
}
class Settings {
  constructor(dir, encryption) { this.file = path.join(dir, 'settings.json'); this.encryption = encryption; this.key = ''; this.value = validate({}); this.loadError = ''; this.load(); }
  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.value = validate(data.settings || {});
      if (data.key) {
        if (!this.encryption.isEncryptionAvailable()) throw Error('Windows key encryption is unavailable.');
        this.key = this.encryption.decryptString(Buffer.from(data.key, 'base64'));
      }
    } catch { this.loadError = 'Saved settings or key could not be read. Please enter your key again.'; }
  }
  public() { return { ...this.value, hasKey: Boolean(this.key), loadError: this.loadError }; }
  save(input, newKey) {
    const next = validate(input);
    if (newKey !== undefined && (typeof newKey !== 'string' || newKey.length > 500 || /[\r\n]/.test(newKey))) throw Error('Invalid API key.');
    const key = newKey === undefined ? this.key : newKey.trim();
    if (key && !this.encryption.isEncryptionAvailable()) throw Error('Windows encryption unavailable; key was not saved.');
    const data = { settings: next, key: key ? this.encryption.encryptString(key).toString('base64') : '' };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
    this.value = next; this.key = key; this.loadError = '';
    return this.public();
  }
  delete() { fs.rmSync(this.file, { force: true }); fs.rmSync(this.file + '.tmp', { force: true }); this.key = ''; this.value = validate({}); }
}
module.exports = { DEFAULTS, validate, Settings };
