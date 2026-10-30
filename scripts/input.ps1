$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DesktopInput {
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static void EnableDpiAwareness() {
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
  }
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [StructLayout(LayoutKind.Explicit)] struct UNION {
    [FieldOffset(0)] public KEYBDINPUT key;
    [FieldOffset(0)] public MOUSEINPUT mouse;
  }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  public static void Click(int x, int y, string button) {
    SetCursorPos(x, y);
    uint down = button == "right" ? 8u : 2u, up = button == "right" ? 16u : 4u;
    int count = button == "double" ? 2 : 1;
    for(int i=0;i<count;i++) { mouse_event(down,0,0,0,UIntPtr.Zero); mouse_event(up,0,0,0,UIntPtr.Zero); }
  }
  public static void Type(string text) {
    foreach(char c in text) {
      INPUT down = new INPUT { type=1, u=new UNION { key=new KEYBDINPUT { scan=c, flags=4 } } };
      INPUT up = down; up.u.key.flags=6;
      if(SendInput(2,new INPUT[]{down,up},Marshal.SizeOf(typeof(INPUT))) != 2) throw new Exception("Windows blocked typing into this window.");
    }
  }
}
'@
[DesktopInput]::EnableDpiAwareness()
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
switch ($request.action) {
  'probe' { Write-Output 'OK' }
  'click' { [DesktopInput]::Click([int]$request.x, [int]$request.y, [string]$request.button) }
  'type' { [DesktopInput]::Type([string]$request.text) }
  'keys' { [System.Windows.Forms.SendKeys]::SendWait([string]$request.keys) }
  default { throw 'Unknown input action' }
}
