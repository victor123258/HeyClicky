param([string]$Mode = 'talk')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
try {
  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $recognizer.SetInputToDefaultAudioDevice()
  $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(900)
  @{type='ready'} | ConvertTo-Json -Compress | Write-Output
  do {
    $result = $recognizer.Recognize([TimeSpan]::FromSeconds(25))
    if ($result -and $result.Text) {
      @{type='text'; text=$result.Text} | ConvertTo-Json -Compress | Write-Output
    } elseif ($Mode -ne 'dictate') {
      @{type='empty'} | ConvertTo-Json -Compress | Write-Output
    }
  } while ($Mode -eq 'dictate')
} catch {
  @{type='error'; text='Windows speech could not start. Check microphone access and install a Windows speech language pack.'} | ConvertTo-Json -Compress | Write-Output
  exit 1
} finally {
  if ($recognizer) { $recognizer.Dispose() }
}
