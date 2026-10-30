$ErrorActionPreference = 'Stop'
Get-ChildItem "$PSScriptRoot\*.ps1" | ForEach-Object {
  $errors = $null
  $tokens = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { throw ($errors | Out-String) }
}
'{"action":"probe"}' | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\input.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Native input helper failed' }
'{"action":"voices"}' | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\speak.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Speech synthesis helper failed' }
Write-Output 'Windows helper smoke checks passed.'
