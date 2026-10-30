// Runs only on Windows CI. Uses isolated user data, no microphone or API calls.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.platform !== 'win32') throw Error('Desktop startup smoke check requires Windows.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heyclicky-desktop-test-'));
try {
  const result = spawnSync(require('electron'), ['.', '--smoke-test'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HEYCLICKY_TEST_USER_DATA: dir }
  });
  if (result.error || result.status !== 0 || !result.stdout.includes('DESKTOP_SMOKE_OK')) throw Error(`${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
  console.log('Electron panel, notch, renderer bridges and expansion smoke check passed.');
} catch (error) {
  console.error(error.message);
  console.log(`::error title=Desktop startup::${error.message.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')}`);
  process.exitCode = 1;
} finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
