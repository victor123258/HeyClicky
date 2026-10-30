const { spawn } = require('node:child_process');
const path = require('node:path');
const { app } = require('electron');
function scriptPath(name) {
  return app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', name) : path.join(__dirname, '../../scripts', name);
}
function kill(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
  else child.kill('SIGKILL');
}
function launch(name, args = [], input) {
  if (process.platform !== 'win32') throw Error('This feature requires Windows 10 or 11.');
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(name), ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(input ? JSON.stringify(input) : '');
  return child;
}
function collect(child, signal, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let output = '', error = '', settled = false;
    const finish = (err) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      err ? reject(err) : resolve(output.trim());
    };
    const abort = () => { kill(child); finish(Error('Stopped.')); };
    const timer = setTimeout(() => { kill(child); finish(Error('Operation timed out.')); }, timeout);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', b => { output += b.toString('utf8'); if (output.length > 65536) { kill(child); finish(Error('Output exceeded 64 KB limit.')); } });
    child.stderr.on('data', b => { error = (error + b.toString('utf8')).slice(-2000); });
    child.on('error', e => finish(e));
    child.on('close', code => finish(code ? Error(error || `Windows helper exited (${code}).`) : null));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
const input = (request, signal) => collect(launch('input.ps1', [], request), signal);
function powershell(command, signal) {
  if (process.platform !== 'win32') throw Error('PowerShell actions require Windows.');
  const prefix = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); ";
  const encoded = Buffer.from(prefix + command, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
  child.stdin.end();
  return collect(child, signal);
}
module.exports = { launch, collect, kill, input, powershell };
