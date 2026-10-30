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
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static IntPtr[] Windows(int[] processes) {
    var allowed = new HashSet<int>(processes);
    var windows = new List<IntPtr>();
    if(allowed.Count==0) return windows.ToArray();
    EnumWindows((window,extra)=>{
      uint pid; GetWindowThreadProcessId(window,out pid);
      if(!allowed.Contains((int)pid)) return true;
      var name = new System.Text.StringBuilder(256); GetClassName(window,name,name.Capacity);
      // Include untitled decorated startup windows, but exclude Edge internals.
      if(name.ToString()=="Chrome_WidgetWin_1" &&
         (GetWindowTextLength(window)>0 || (GetWindowLong(window,-16)&0x00C00000)!=0)) windows.Add(window);
      return true;
    },IntPtr.Zero);
    return windows.ToArray();
  }
  public static void RequestClose(IntPtr window) {
    // Posting is only a request. The caller must re-enumerate until absent.
    PostMessage(window,0x10,IntPtr.Zero,IntPtr.Zero);
  }
  public static int Apply(int[] processes, string action) {
    int count=0, pending=0;
    foreach(var window in Windows(processes)) {
      if(action=="hide") ShowWindowAsync(window,0);
      else if(action=="minimize") ShowWindowAsync(window,6);
      else if(action=="restore") { ShowWindowAsync(window,9); SetForegroundWindow(window); }
      count++;
      if(action=="hide" && IsWindowVisible(window)) pending++;
      if(action=="minimize" && (!IsWindowVisible(window)||!IsIconic(window))) pending++;
      if(action=="restore" && (!IsWindowVisible(window)||IsIconic(window))) pending++;
    }
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
function Get-ProfileProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -and [Regex]::IsMatch($_.CommandLine, $profileArgument, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase) } | ForEach-Object { [int]$_.ProcessId })
}
$deadline = [DateTime]::UtcNow.AddSeconds(5)
if ($request.action -eq 'close') {
  $sent = New-Object 'System.Collections.Generic.HashSet[System.IntPtr]'
  $quietSince = $null
  do {
    $processes = @(Get-ProfileProcesses)
    $windows = @([EdgeHelperWindow]::Windows([int[]]$processes))
    foreach ($window in $windows) {
      if ($sent.Add($window)) { [EdgeHelperWindow]::RequestClose($window) }
    }
    if ($windows.Count -eq 0) {
      if ($null -eq $quietSince) { $quietSince = [DateTime]::UtcNow }
      # Allow late startup windows to appear; no process is killed, and a
      # normal Edge browser can never match this exact dedicated profile.
      $quietMs = if ($sent.Count -gt 0 -or $processes.Count -eq 0) { 1000 } else { 5000 }
      if (([DateTime]::UtcNow - $quietSince).TotalMilliseconds -ge $quietMs) { break }
    } else { $quietSince = $null }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  $remaining = @([EdgeHelperWindow]::Windows([int[]]@(Get-ProfileProcesses))).Count
  if ($remaining -gt 0) { throw 'The dedicated Edge helper window is still open. Close it manually; closure could not be verified.' }
  @{ action='close'; verified=$true; remainingWindows=0; closedWindows=$sent.Count } | ConvertTo-Json -Compress
  exit 0
}
# Retry startup discovery/state checks in one bounded helper, never an idle poller.
do {
  $processes = @(Get-ProfileProcesses)
  $count = [EdgeHelperWindow]::Apply([int[]]$processes, [string]$request.action)
  if ($count -gt 0) { break }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if ($count -eq 0) { throw 'Could not verify the dedicated Edge helper window state. Restore visible setup or try Hide Edge helper again.' }
Write-Output $count
