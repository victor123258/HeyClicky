$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Emit($data) { [Console]::Out.WriteLine(($data | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class HeldKeys {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
}
'@
  $config = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($config.probe) { Emit @{ type='ready' }; exit 0 }
  $previous = @{}
  Emit @{type='ready'}
  $tick = 0
  while ($true) {
    $tick++
    foreach ($combo in $config.combos) {
      $down = $true
      foreach ($group in $combo.groups) {
        $any = $false
        foreach ($key in $group) { if (([HeldKeys]::GetAsyncKeyState([int]$key) -band 0x8000) -ne 0) { $any = $true } }
        if (-not $any) { $down = $false; break }
      }
      if (-not $down -and ($previous[$combo.name] -or ($tick % 6) -eq 0)) { Emit @{type='release'; name=$combo.name} }
      $previous[$combo.name] = $down
    }
    Start-Sleep -Milliseconds 16
  }
} catch { Emit @{type='error'; text='Could not watch voice shortcut release. Restart the app or use the on-screen hold button.'}; exit 1 }
