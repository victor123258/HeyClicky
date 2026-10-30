param([string]$Culture = '', [switch]$Probe)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Emit($data) { [Console]::Out.WriteLine(($data | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
$capture = $null
try {
  Add-Type -AssemblyName System.Speech
  Add-Type -ReferencedAssemblies @([System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location, 'System.dll', 'System.Core.dll') -TypeDefinition @'
using System;
using System.Speech.Recognition;
using System.Collections.Concurrent;
public class VoiceEvent { public string Kind; public string Text; public int Level; }
public class HeldSpeech : IDisposable {
  public ConcurrentQueue<VoiceEvent> Events = new ConcurrentQueue<VoiceEvent>();
  private SpeechRecognitionEngine engine;
  public HeldSpeech(RecognizerInfo info) {
    engine = new SpeechRecognitionEngine(info);
    engine.LoadGrammar(new DictationGrammar());
    engine.SetInputToDefaultAudioDevice();
    engine.SpeechRecognized += (s,e) => Events.Enqueue(new VoiceEvent { Kind="segment", Text=e.Result.Text });
    engine.SpeechHypothesized += (s,e) => Events.Enqueue(new VoiceEvent { Kind="partial", Text=e.Result.Text });
    engine.AudioLevelUpdated += (s,e) => Events.Enqueue(new VoiceEvent { Kind="level", Level=e.AudioLevel });
    engine.RecognizeCompleted += (s,e) => Events.Enqueue(new VoiceEvent { Kind="complete", Text=e.Error == null ? "" : e.Error.Message });
  }
  public void Start() { engine.RecognizeAsync(RecognizeMode.Multiple); }
  public void Finish() { engine.RecognizeAsyncStop(); }
  public void Dispose() { engine.Dispose(); }
}
'@
  if ($Probe) { Emit @{type='ready'}; exit 0 }
  $installed = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  if ($installed.Count -eq 0) { throw 'No Windows speech recognition engine is installed. Install a Speech language pack, then use Find languages in Settings.' }
  $selected = $null
  if ($Culture) { $selected = $installed | Where-Object { $_.Culture.Name -eq $Culture } | Select-Object -First 1 }
  else { $selected = $installed | Where-Object { $_.Culture.Name -eq [System.Globalization.CultureInfo]::CurrentUICulture.Name } | Select-Object -First 1; if (-not $selected) { $selected = $installed[0] } }
  if (-not $selected) { throw 'The selected speech recognition language is not installed.' }
  try { $capture = New-Object HeldSpeech -ArgumentList $selected; $capture.Start() }
  catch { throw 'Could not open speech input. Check the Windows default microphone, desktop microphone permissions and recognition language pack.' }
  Emit @{type='ready'; language=$selected.Culture.Name}
  $read = [Console]::In.ReadLineAsync()
  $segments = New-Object 'System.Collections.Generic.List[string]'
  $finishing = $false; $complete = $false; $deadline = [DateTime]::UtcNow.AddSeconds(85)
  while (-not $complete) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Voice capture timed out. Hold for a shorter question, then release to send.' }
    if (-not $finishing -and $read.IsCompleted) {
      $line = $read.Result
      if (-not $line) { throw 'Voice input was cancelled.' }
      $command = $line | ConvertFrom-Json
      if ($command.action -ne 'finish') { throw 'Unknown voice control command.' }
      $finishing = $true; $deadline = [DateTime]::UtcNow.AddSeconds(10); $capture.Finish()
    }
    $eventData = $null; $level = -1
    while ($capture.Events.TryDequeue([ref]$eventData)) {
      switch ($eventData.Kind) {
        'segment' { $segments.Add($eventData.Text); Emit @{type='partial'; text=($segments -join ' ')} }
        'partial' { Emit @{type='partial'; text=((@($segments) + $eventData.Text) -join ' ')} }
        'level' { $level = $eventData.Level }
        'complete' { if ($eventData.Text) { throw $eventData.Text }; $complete = $true }
      }
    }
    if ($level -ge 0) { Emit @{type='level'; level=$level} }
    Start-Sleep -Milliseconds 40
  }
  if (-not $finishing) { throw 'The microphone stopped before you released the shortcut. Please try again.' }
  $text = ($segments -join ' ').Trim()
  if ($text) { Emit @{type='text'; text=$text} } else { Emit @{type='empty'} }
} catch { Emit @{type='error'; text=$_.Exception.Message}; exit 1 }
finally { if ($capture) { $capture.Dispose() } }
