$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.action -eq 'voices') {
    $voices = @($speaker.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
    ConvertTo-Json -InputObject $voices -Compress | Write-Output
  } else {
    if ($request.voice) { $speaker.SelectVoice($request.voice) }
    $speaker.Rate = [int]$request.rate
    $speaker.Speak([string]$request.text)
  }
} finally { $speaker.Dispose() }
