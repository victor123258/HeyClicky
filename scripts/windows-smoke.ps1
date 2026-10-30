$ErrorActionPreference = 'Stop'
Get-ChildItem "$PSScriptRoot\*.ps1" | ForEach-Object {
  $errors = $null
  $tokens = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { throw ($errors | Out-String) }
}
# Use the same raw UTF-8 process protocol as Electron, not PowerShell's object pipeline.
node "$PSScriptRoot\windows-smoke.js"
if ($LASTEXITCODE -ne 0) { throw 'Native helper probes failed; see annotated error details above.' }
Write-Output 'Windows helper smoke checks passed.'
