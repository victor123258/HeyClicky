const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen, desktopCapturer, safeStorage, shell, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { Settings } = require('./lib/settings');
const { complete } = require('./lib/llm');
const { runAgent } = require('./lib/agent');
const { Speech } = require('./speech');
const native = require('./native');
let panel, tray, settings, speech, controller, approval, quitting = false, state = 'idle', listeningMode;
let overlays = [], history = [], activeDisplay, lastAnnotations = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function emit(type, data) { if (panel && !panel.isDestroyed()) panel.webContents.send('event', { type, data }); }
function setState(next) { state = next; emit('state', next); broadcast('state', next); }
function broadcast(type, data) { for (const win of overlays) if (!win.isDestroyed()) win.webContents.send('overlay', { type, data }); }
function showPanel() { panel.show(); panel.focus(); }
function error(error) { emit('error', error.message || String(error)); showPanel(); }
function stop() {
  controller?.abort(); controller = null; speech?.stop(); listeningMode = null;
  if (approval) { approval.resolve(false); approval = null; emit('approval', null); }
  lastAnnotations = []; broadcast('clear'); setState('idle');
}
function registerHotkeys(value) {
  globalShortcut.unregisterAll();
  const actions = { talk: () => listen('talk'), agent: () => listen('agent'), dictate: toggleDictation, panel: () => panel.isVisible() ? panel.hide() : showPanel(), stop };
  for (const [name, combo] of Object.entries(value.hotkeys)) {
    let registered = false;
    try { registered = globalShortcut.register(combo, actions[name]); } catch { /* invalid accelerator */ }
    if (!registered) { globalShortcut.unregisterAll(); throw Error(`Cannot register ${name} hotkey (${combo}). It may be invalid or used by another app.`); }
  }
}
function createOverlays() {
  for (const win of overlays) win.destroy(); overlays = [];
  for (const display of screen.getAllDisplays()) {
    const win = new BrowserWindow({ ...display.bounds, transparent: true, frame: false, hasShadow: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, resizable: false, webPreferences: { preload: path.join(__dirname, '../preload/overlay.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setIgnoreMouseEvents(true); win.setAlwaysOnTop(true, 'screen-saver');
    win.setContentProtection(true);
    win.loadFile(path.join(__dirname, '../renderer/overlay.html'));
    win.webContents.on('did-finish-load', () => win.webContents.send('overlay', { type: 'init', data: { bounds: display.bounds, buddy: settings.value.buddy } }));
    overlays.push(win);
  }
}
async function capture(signal) {
  if (!settings.value.screenContext) throw Error('Screen context is off. Turn it on before taking a screenshot.');
  signal?.throwIfAborted();
  const display = screen.getAllDisplays().find(d => d.id === activeDisplay?.id);
  if (!display) throw Error('Selected display disconnected. Start a new request.');
  const wasVisible = panel.isVisible();
  // Hide our own UI and drawings so they do not obscure the application.
  panel.hide(); for (const win of overlays) win.hide();
  try {
    await delay(180); signal?.throwIfAborted();
    const scale = Math.min(1, 1600 / display.size.width);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) } });
    signal?.throwIfAborted();
    const source = sources.find(s => String(s.display_id) === String(display.id));
    if (!source || source.thumbnail.isEmpty()) throw Error('Could not capture this display.');
    return 'data:image/jpeg;base64,' + source.thumbnail.toJPEG(75).toString('base64');
  } finally {
    for (const win of overlays) if (!win.isDestroyed()) win.showInactive();
    if (wasVisible && !panel.isDestroyed()) panel.showInactive();
  }
}
function approve(action, signal) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      approval = null; emit('approval', null); resolve(value);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), 120000);
    approval = { id: crypto.randomUUID(), resolve: finish };
    signal.addEventListener('abort', abort, { once: true });
    emit('approval', { id: approval.id, ...action }); setState('approval'); showPanel();
    if (signal.aborted) finish(false);
  });
}
async function execute(name, args, signal) {
  signal.throwIfAborted(); setState('working');
  if (name === 'screenshot') return capture(signal);
  if (name === 'draw') {
    if (!settings.value.screenContext) throw Error('Screen context is disabled.');
    lastAnnotations.push({ ...args, bounds: activeDisplay.bounds });
    lastAnnotations = lastAnnotations.slice(-8); broadcast('draw', lastAnnotations); return 'Annotation displayed.';
  }
  // Return focus to the underlying application before input. Approvals always show exact arguments.
  if (['click', 'type_text', 'press_keys'].includes(name)) { panel.hide(); await delay(350); signal.throwIfAborted(); }
  if (name === 'click') {
    if (!screen.getAllDisplays().some(d => d.id === activeDisplay.id)) throw Error('Display disconnected.');
    const b = activeDisplay.bounds;
    const point = screen.dipToScreenPoint({ x: Math.round(b.x + args.x / 1000 * (b.width - 1)), y: Math.round(b.y + args.y / 1000 * (b.height - 1)) });
    await native.input({ action: 'click', ...point, button: args.button }, signal); return 'Clicked. Take a new screenshot to verify.';
  }
  if (name === 'type_text') { await native.input({ action: 'type', text: args.text }, signal); return 'Text sent to focused window. Verify with a screenshot.'; }
  if (name === 'press_keys') { await native.input({ action: 'keys', keys: args.keys }, signal); return 'Keys sent. Verify result.'; }
  if (name === 'powershell') return await native.powershell(args.command, signal) || 'Command completed.';
  if (name === 'read_file') {
    const handle = await fs.open(args.path, 'r');
    try { const info = await handle.stat(); if (!info.isFile() || info.size > 32768) throw Error('Read limit is 32 KB and regular text files only.'); return await handle.readFile('utf8'); }
    finally { await handle.close(); }
  }
  if (name === 'write_file') { signal.throwIfAborted(); await fs.writeFile(args.path, args.content, { encoding: 'utf8', signal }); return 'File written.'; }
  if (name === 'open_url') { await shell.openExternal(args.url); return 'Opened in default browser.'; }
  if (name === 'fetch_url') {
    const response = await fetch(args.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: 'error' });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!/text\/|application\/(json|xml)/i.test(type)) throw Error('Only text, JSON or XML responses can be fetched.');
    const reader = response.body.getReader(); let data = Buffer.alloc(0);
    try { while (data.length < 32768) { const { value, done } = await reader.read(); if (done) break; data = Buffer.concat([data, Buffer.from(value).subarray(0, 32768 - data.length)]); } }
    finally { await reader.cancel(); }
    return data.toString('utf8') + '\n[Maximum 32 KB; redirects are not followed.]';
  }
  throw Error('Unknown tool.');
}
async function ask(text, mode = 'talk', display) {
  if (controller || listeningMode) throw Error('Stop the current task before starting another.');
  if (typeof text !== 'string' || !text.trim() || text.length > 12000 || !['talk', 'agent'].includes(mode)) throw Error('Enter a question (up to 12,000 characters).');
  if (!settings.key) throw Error('Open Settings and add your OpenRouter API key.');
  if (/^agent\b[\s,:]*/i.test(text)) { mode = 'agent'; text = text.replace(/^agent\b[\s,:]*/i, ''); }
  const current = controller = new AbortController(); const signal = current.signal;
  activeDisplay = display || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  lastAnnotations = []; broadcast('clear');
  emit('message', { role: 'user', text, mode }); setState('thinking');
  try {
    const image = settings.value.screenContext ? await capture(signal) : null;
    const chunks = [];
    const answer = await runAgent({ text, mode, history, image, signal, askBeforeActions: settings.value.askBeforeActions,
      complete: (messages, tools, signal) => complete({ key: settings.key, model: settings.value.model, messages, tools, signal }), execute, approve,
      onMessage: text => { chunks.push(text); emit('message', { role: 'assistant', text }); }, onTool: data => { emit('tool', data); if (data.status !== 'pending') setState('thinking'); }
    });
    signal.throwIfAborted();
    if (answer && chunks[chunks.length - 1] !== answer) emit('message', { role: 'assistant', text: answer });
    // Persist text only in memory, never previous screen images or tool payloads.
    history.push({ role: 'user', content: text }, { role: 'assistant', content: [...chunks, ...(chunks.at(-1) !== answer ? [answer] : [])].join('\n').slice(0, 12000) });
    history = history.slice(-12);
    if (settings.value.speak && answer) {
      setState('speaking');
      try { await speech.speak(answer, settings.value, signal); } catch (e) { if (!signal.aborted) emit('error', 'Answer ready, but voice failed: ' + e.message); }
    }
  } catch (e) { if (!signal.aborted) error(e); }
  finally { if (controller === current) { controller = null; setState('idle'); } }
}
function listen(mode) {
  if (controller || listeningMode) { stop(); return; }
  if (!settings.key) { showPanel(); emit('settings-open'); error(Error('Add your API key before using voice chat.')); return; }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  listeningMode = mode; setState('starting');
  try {
    speech.listen(mode, text => {
      // Wait for helper closure before starting synthesis, preventing microphone feedback.
      listeningMode = null; speech.stop();
      ask(text, mode, display).catch(error);
    }, () => setState('listening'), error, () => { if (listeningMode === mode) { listeningMode = null; setState('idle'); } });
  } catch (e) { listeningMode = null; setState('idle'); error(e); }
}
function toggleDictation() {
  if (controller || listeningMode) { stop(); return; }
  listeningMode = 'dictate'; panel.hide(); setState('starting');
  controller = new AbortController(); const current = controller;
  let queue = Promise.resolve();
  try {
    speech.listen('dictate', text => {
      emit('dictation', text);
      queue = queue.then(() => { current.signal.throwIfAborted(); return native.input({ action: 'type', text: text + ' ' }, current.signal); }).catch(e => { if (!current.signal.aborted) { stop(); error(e); } });
    }, () => setState('dictating'), e => { stop(); error(e); }, () => { if (controller === current) stop(); });
  } catch (e) { stop(); error(e); }
}
function trusted(event) {
  if (!panel || event.sender !== panel.webContents || event.senderFrame !== panel.webContents.mainFrame) throw Error('Untrusted IPC sender.');
}
function handle(channel, fn) { ipcMain.handle(channel, async (event, ...args) => { trusted(event); try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message }; } }); }
function installIPC() {
  handle('get-settings', () => ({ ...settings.public(), platform: process.platform, version: app.getVersion(), state, history, packaged: app.isPackaged }));
  handle('save-settings', (value, key) => {
    if (controller || listeningMode) throw Error('Stop the current task before changing settings.');
    const { validate } = require('./lib/settings'); const next = validate(value), previous = settings.value;
    try {
      registerHotkeys(next);
      const saved = settings.save(next, key);
      app.setLoginItemSettings({ openAtLogin: next.startWithWindows, path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe') });
      broadcast('buddy', next.buddy); return saved;
    } catch (e) { registerHotkeys(previous); throw e; }
  });
  handle('test-key', async () => { await complete({ key: settings.key, model: settings.value.model, messages: [{ role: 'user', content: 'Reply with OK.' }] }); return 'Connected. Text request succeeded; screen mode also needs image and tool support.'; });
  handle('voices', () => speech.voices());
  handle('ask', (text, mode) => { if (controller || listeningMode) throw Error('A task is already running.'); ask(text, mode).catch(error); });
  handle('listen', mode => { if (!['talk', 'agent'].includes(mode)) throw Error('Invalid mode.'); listen(mode); });
  handle('dictate', toggleDictation);
  handle('stop', stop);
  handle('hide', () => panel.hide());
  handle('clear', () => { stop(); history = []; emit('cleared'); });
  handle('approval', (id, allowed) => { if (!approval || approval.id !== id || typeof allowed !== 'boolean') throw Error('Approval expired.'); approval.resolve(allowed); });
  handle('delete-data', async () => {
    const result = await dialog.showMessageBox(panel, { type: 'warning', title: 'Delete local data?', message: 'Delete your encrypted key, settings and conversation, then quit?', buttons: ['Cancel', 'Delete and quit'], defaultId: 0, cancelId: 0, noLink: true });
    if (result.response !== 1) return false;
    stop(); history = []; app.setLoginItemSettings({ openAtLogin: false }); settings.delete();
    await session.defaultSession.clearStorageData(); await session.defaultSession.clearCache(); quitting = true; app.quit(); return true;
  });
  handle('open-link', name => {
    const links = { key: 'https://openrouter.ai/settings/keys', privacy: 'https://openrouter.ai/settings/privacy', github: 'https://github.com/victor123258/HeyClicky' };
    if (!links[name]) throw Error('Unknown link.'); return shell.openExternal(links[name]);
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => panel && showPanel());
  app.whenReady().then(() => {
    settings = new Settings(app.getPath('userData'), safeStorage); speech = new Speech();
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    panel = new BrowserWindow({ width: 1100, height: 790, minWidth: 850, minHeight: 650, title: 'HeyClicky Community', backgroundColor: '#f6f7fb', autoHideMenuBar: true, icon: path.join(__dirname, '../../assets/icon.png'), webPreferences: { preload: path.join(__dirname, '../preload/panel.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
    panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    panel.webContents.on('will-navigate', e => e.preventDefault());
    panel.on('close', e => { if (!quitting) { e.preventDefault(); panel.hide(); } });
    installIPC(); panel.loadFile(path.join(__dirname, '../renderer/index.html'));
    createOverlays(); screen.on('display-added', createOverlays); screen.on('display-removed', createOverlays); screen.on('display-metrics-changed', createOverlays);
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../../assets/icon.png')).resize({ width: 32, height: 32 }));
    tray.setToolTip('HeyClicky Community — your desktop buddy');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open HeyClicky', click: showPanel }, { label: 'Talk', click: () => listen('talk') }, { label: 'Dictate / stop', click: toggleDictation }, { label: 'Stop everything', click: stop }, { type: 'separator' }, { label: 'Quit', click: () => { quitting = true; app.quit(); } }]));
    tray.on('double-click', showPanel);
    panel.webContents.on('did-finish-load', () => {
      if (!settings.key) emit('settings-open');
      if (process.platform !== 'win32') emit('error', 'Desktop automation and voice require Windows. This platform is for UI development only.');
      try { registerHotkeys(settings.value); } catch (e) { error(e); }
    });
    setInterval(() => broadcast('cursor', screen.getCursorScreenPoint()), 45).unref();
  }).catch(e => { dialog.showErrorBox('HeyClicky could not start', e.message); app.quit(); });
  app.on('before-quit', () => { quitting = true; stop(); globalShortcut.unregisterAll(); });
  app.on('window-all-closed', () => {});
}
