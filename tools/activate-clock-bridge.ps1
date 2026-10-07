param([Parameter(Mandatory=$true)][string]$EvidenceRoot,[switch]$Activate)
$ErrorActionPreference='Stop'
$bridgeExe=Join-Path $env:LOCALAPPDATA 'Programs\PC Bridge\PC Bridge.exe'
$installed=Join-Path $env:LOCALAPPDATA 'Programs\PC Bridge\resources\app.asar'
$profileRoot=Join-Path $env:APPDATA 'PC Bridge'
$statePath=Join-Path $profileRoot 'workspace-state.json'
$candidate=Join-Path $EvidenceRoot 'bridge-candidate\app.asar'
$verification=Get-Content -LiteralPath (Join-Path $EvidenceRoot 'VERIFICATION.json') -Raw | ConvertFrom-Json
if($verification.tests.Count -ne 2 -or @($verification.tests | Where-Object {$_.failed -ne 0 -or $_.skipped -ne 0}).Count -or -not $verification.clock_ui.ok){throw 'Focused verification incomplete'}
if(-not $verification.desktop_full_smoke.ok -and ($verification.baseline_full_smoke.ok -or $verification.desktop_full_smoke.error -ne $verification.baseline_full_smoke.error)){throw 'Unresolved new desktop regression'}
$oldHash=$verification.build.installed_sha256
$newHash=$verification.build.candidate_sha256
foreach($file in @($bridgeExe,$installed,$candidate,$statePath)){
  $item=Get-Item -LiteralPath $file
  while($null -ne $item){if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.LinkType){throw 'Linked installation input refused'};$item=$item.Parent}
}
if((Get-FileHash -LiteralPath $installed).Hash -ne $oldHash){throw 'Installed Bridge changed; inspect before rebuilding'}
if((Get-FileHash -LiteralPath $candidate).Hash -ne $newHash){throw 'Candidate identity mismatch'}
function Read-Idle {
  $value=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if(@($value.jobs | Where-Object state -In @('pending','queued','running')).Count){throw 'Bridge has work; activation deferred'}
  return $value
}
function Read-Control($route,$scope){
  $discovery=Get-Content -LiteralPath (Join-Path $profileRoot 'chaff-control.json') -Raw | ConvertFrom-Json
  $headers=@{Authorization=('Bearer '+$discovery.token)}
  $body=@{instance=$discovery.instance;scope=$scope}|ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri ('http://127.0.0.1:'+$discovery.port+'/v1/'+$route) -Method Post -ContentType 'application/json' -Headers $headers -Body $body -TimeoutSec 3
}
function Assert-LiveIdle {
  $value=Read-Control 'access-status' 'all_bridge'
  if(-not $value.jobs_ended -or $value.active_jobs -ne 0 -or $value.executing_jobs -ne 0){throw 'Live Bridge is busy; activation deferred'}
  $protected=Read-Control 'protected-status' 'protected_bridge'
  if($protected.protected_only -or $protected.state -ne 'ordinary'){throw 'Protected work is present; activation deferred'}
  return $value
}
$before=Read-Idle
$liveBefore=Assert-LiveIdle
$apps=@(Get-CimInstance Win32_Process -Filter "Name='PC Bridge.exe'" | Where-Object ExecutablePath -EQ $bridgeExe)
$roots=@($apps | Where-Object {$_.ParentProcessId -notin $apps.ProcessId})
if($roots.Count -ne 1){throw 'Expected one running installed Bridge'}
$settingsHashes=@{}
foreach($name in @('ai-clients.json','connection.json','tunnel-key.encrypted','remote-tunnel-guest.encrypted')){
  $file=Join-Path $profileRoot $name
  if(Test-Path -LiteralPath $file){$settingsHashes[$name]=(Get-FileHash -LiteralPath $file).Hash}
}
if(-not $Activate){@{status='READY';idle=$true;candidate_sha256=$newHash}|ConvertTo-Json -Compress;exit}
$backup=Join-Path $EvidenceRoot ('activation-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $installed -Destination (Join-Path $backup 'app.asar')
if((Get-FileHash -LiteralPath (Join-Path $backup 'app.asar')).Hash -ne $oldHash){throw 'Rollback backup failed'}
# Owner authorized idle restart. Stop only identity-checked installed Bridge PIDs.
$null=Read-Idle;$null=Assert-LiveIdle
foreach($process in @($roots)+@($apps | Where-Object {$_.ProcessId -notin $roots.ProcessId})){
  $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$process.ProcessId)
  if($null -eq $current){continue}
  if($current.ExecutablePath -ne $bridgeExe -or $current.CreationDate -ne $process.CreationDate){throw 'PID identity changed'}
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 500
if(@(Get-CimInstance Win32_Process -Filter "Name='PC Bridge.exe'" | Where-Object ExecutablePath -EQ $bridgeExe).Count){throw 'Bridge shutdown incomplete'}
try{
  Copy-Item -LiteralPath $candidate -Destination $installed -Force
  if((Get-FileHash -LiteralPath $installed).Hash -ne $newHash){throw 'Installation hash mismatch'}
}catch{
  Copy-Item -LiteralPath (Join-Path $backup 'app.asar') -Destination $installed -Force
  Start-Process -FilePath $bridgeExe -WindowStyle Hidden | Out-Null
  throw
}
Start-Process -FilePath $bridgeExe -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backup 'stdout.txt') -RedirectStandardError (Join-Path $backup 'stderr.txt') | Out-Null
$healthy=$null
for($i=0;$i -lt 24;$i++){
  try{$value=Read-Control 'access-status' 'all_bridge';if($value.instance -ne $liveBefore.instance){$healthy=$value;break}}catch{}
  Start-Sleep -Milliseconds 500
}
if($null -eq $healthy){throw ('Updated health unavailable; verified rollback is at '+$backup)}
$after=Read-Idle
foreach($field in @('trusted_access','access_mode','full_access_acknowledged','default_project_id')){if($before.$field -ne $after.$field){throw ('Access setting changed: '+$field)}}
foreach($name in $settingsHashes.Keys){if((Get-FileHash -LiteralPath (Join-Path $profileRoot $name)).Hash -ne $settingsHashes[$name]){throw ('Connection/client settings changed: '+$name)}}
$display=Get-Content -LiteralPath (Join-Path $profileRoot 'ditto-clock-display.json') -Raw | ConvertFrom-Json
$view=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$display.port+'/v1/reply-clocks') -Headers @{Authorization=('Bearer '+$display.token)} -TimeoutSec 3
if($view.instance -ne $display.instance -or $view.protocol -ne 'ditto-reply-clocks-v1'){throw 'Display handshake failed'}
$report=@{status='ACTIVATED';backup=$backup;installed_sha256=$newHash;access_settings_unchanged=$true;connection_settings_unchanged=$true;access_enabled=$healthy.access_enabled;active_jobs=$healthy.active_jobs;clock_feed_verified=$true;chaff_modified=$false;activated_at=[DateTime]::UtcNow.ToString('o');known_baseline_smoke_failure=$verification.desktop_regression}
$report | ConvertTo-Json | Out-File -LiteralPath (Join-Path $backup 'ACTIVATION.json') -Encoding utf8
$report | ConvertTo-Json -Compress
