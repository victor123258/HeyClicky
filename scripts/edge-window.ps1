$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class EdgeHelperWindow {
  delegate bool EnumCallback(IntPtr window, IntPtr extra);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumCallback callback, IntPtr extra);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int max);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static int Apply(int[] processes, string action) {
    var allowed = new HashSet<int>(processes); int count=0, pending=0;
    if(allowed.Count==0) return 0;
    EnumWindows((window,extra)=>{
      uint pid; GetWindowThreadProcessId(window,out pid);
      var name = new System.Text.StringBuilder(256); GetClassName(window,name,name.Capacity);
      // Hidden windows must remain restorable/closable; ignore Edge internals.
      if(allowed.Contains((int)pid) && name.ToString()=="Chrome_WidgetWin_1" && GetWindowTextLength(window)>0) {
        if(action=="hide") ShowWindowAsync(window,0);
        else if(action=="minimize") ShowWindowAsync(window,6);
        else if(action=="restore") { ShowWindowAsync(window,9); SetForegroundWindow(window); }
        else if(action=="close") PostMessage(window,0x10,IntPtr.Zero,IntPtr.Zero);
        count++;
        // ShowWindowAsync only queues a request. Verify the actual state on a later pass.
        if(action=="hide" && IsWindowVisible(window)) pending++;
        if(action=="minimize" && (!IsWindowVisible(window)||!IsIconic(window))) pending++;
        if(action=="restore" && (!IsWindowVisible(window)||IsIconic(window))) pending++;
      }
      return true;
    },IntPtr.Zero);
    return pending==0 ? count : 0;
  }
}
'@
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($request.action -eq 'probe') { Write-Output 'OK'; exit 0 }
if ($request.action -notin @('hide','minimize','restore','close')) { throw 'Invalid Edge window action' }
$profile = [string]$request.profile
if (-not $profile.EndsWith('\edge-voice-profile', [StringComparison]::OrdinalIgnoreCase)) { throw 'Only the dedicated Edge voice profile may be controlled' }
$escaped = [Regex]::Escape($profile)
$profileArgument = '(?:^|\s)(?:"--user-data-dir=' + $escaped + '"|--user-data-dir="' + $escaped + '"|--user-data-dir=' + $escaped + '(?=\s|$))'
# Startup can connect the loopback stream before Edge creates/titles its native
# app window. Retry discovery/state checks in one bounded helper, never an idle
# poller. Restrict every attempt to the exact dedicated profile command line.
$deadline = [DateTime]::UtcNow.AddSeconds(5)
do {
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -and [Regex]::IsMatch($_.CommandLine, $profileArgument, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase) } | ForEach-Object { [int]$_.ProcessId })
  $count = [EdgeHelperWindow]::Apply([int[]]$processes, [string]$request.action)
  if ($count -gt 0 -or $request.action -eq 'close') { break }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if ($count -eq 0 -and $request.action -ne 'close') { throw 'Could not verify the dedicated Edge helper window state. Restore visible setup or try Hide Edge helper again.' }
Write-Output $count
