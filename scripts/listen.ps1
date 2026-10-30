param(
  [ValidateSet('talk', 'agent', 'dictate', 'test', 'probe')][string]$Mode = 'talk',
  [string]$Culture = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Write directly to stdout and flush. Write-Output through the PowerShell pipeline
# can buffer readiness/transcripts, especially during continuous dictation.
function Send-Event($eventData) {
  [Console]::Out.WriteLine(($eventData | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}
$recognizer = $null
try {
  Add-Type -AssemblyName System.Speech
  $installed = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  if ($Mode -eq 'probe') {
    $languages = @($installed | ForEach-Object { @{ id=$_.Culture.Name; name=$_.Culture.DisplayName; engine=$_.Name } })
    Send-Event @{ languages=$languages; defaultLanguage=[System.Globalization.CultureInfo]::CurrentUICulture.Name }
    exit 0
  }
  if ($installed.Count -eq 0) {
    throw 'No Windows speech recognition engine is installed. Install a Speech language pack in Windows Settings > Time & language > Language & region > Language options. Text-to-speech voices alone are not sufficient.'
  }
  $selected = $null
  if ($Culture) {
    $selected = $installed | Where-Object { $_.Culture.Name -eq $Culture } | Select-Object -First 1
    if (-not $selected) { throw "Speech recognition language $Culture is not installed. Choose an installed language in HeyClicky Settings." }
  } else {
    $selected = $installed | Where-Object { $_.Culture.Name -eq [System.Globalization.CultureInfo]::CurrentUICulture.Name } | Select-Object -First 1
    if (-not $selected) { $selected = $installed[0] }
  }
  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $selected
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  try { $recognizer.SetInputToDefaultAudioDevice() }
  catch { throw 'Could not open the default microphone. Enable Microphone access AND Let desktop apps access your microphone in Windows Settings > Privacy & security > Microphone. Select a working default input device in System > Sound.' }
  $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(10)
  $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(1200)
  $recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1500)
  $recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(30)
  Send-Event @{type='ready'; language=$selected.Culture.Name}
  do {
    $result = $recognizer.Recognize([TimeSpan]::FromSeconds(60))
    if ($result -and $result.Text) {
      Send-Event @{type='text'; text=$result.Text; confidence=$result.Confidence}
    } elseif ($Mode -ne 'dictate') {
      Send-Event @{type='empty'}
    }
  } while ($Mode -eq 'dictate')
} catch {
  Send-Event @{type='error'; text=$_.Exception.Message}
  exit 1
} finally {
  if ($recognizer) { $recognizer.Dispose() }
}
