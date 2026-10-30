const {spawnSync} = require('node:child_process');
const path = require('node:path');
if (process.platform !== 'win32') throw Error('Native helper checks require Windows.');
try {
  for (const [name, request] of [['input.ps1', {action:'probe'}], ['speak.ps1', {action:'voices'}]]) {
    const result = spawnSync('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,name)], { input:JSON.stringify(request), encoding:'utf8', windowsHide:true, timeout:30000 });
    if (result.error || result.status !== 0) throw Error(`${name}: ${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
    if (name === 'input.ps1' && result.stdout.trim() !== 'OK') throw Error('Input helper probe returned an unexpected response.');
    if (name === 'speak.ps1') { const voices=JSON.parse(result.stdout); if (!Array.isArray(voices)) throw Error('Voice enumeration did not return an array.'); }
    console.log(`${name}: passed`);
  }
} catch (error) {
  console.error(error.message);
  const message=error.message.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
  console.log(`::error title=Native helper probe::${message}`);
  process.exitCode=1;
}
