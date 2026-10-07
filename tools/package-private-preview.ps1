param([Parameter(Mandatory=$true)][string]$Folder,[Parameter(Mandatory=$true)][string]$Zip)
$ErrorActionPreference='Stop'
$source=(Resolve-Path -LiteralPath $Folder).Path
$destination=[IO.Path]::GetFullPath($Zip)
if(Test-Path -LiteralPath $destination){throw 'Refusing to replace an existing archive'}
$files=@(Get-ChildItem -LiteralPath $source -File -Recurse)
foreach($file in $files){
  $relative=[IO.Path]::GetRelativePath($source,$file.FullName).Replace('\','/')
  if($relative -match '(^|/)(local-profile|node_modules|\.git|\.env|connection\.json|workspace-state\.json|ditto-clock-display\.json)(/|$)'){throw 'Private/runtime data found in package'}
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($source,$destination,[IO.Compression.CompressionLevel]::Optimal,$true)
$archive=[IO.Compression.ZipFile]::OpenRead($destination)
$verified=0
try{
  foreach($entry in $archive.Entries){
    if($entry.FullName.EndsWith('/')){continue}
    $parts=$entry.FullName -split '/',2
    if($parts.Count -ne 2 -or $parts[1] -match '(^|/)\.\.(/|$)'){throw 'Invalid archive member'}
    $file=[IO.Path]::GetFullPath((Join-Path $source $parts[1]))
    if(-not $file.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive path escapes source'}
    $stream=$entry.Open();$hasher=[Security.Cryptography.SHA256]::Create()
    try{$hash=[Convert]::ToHexString($hasher.ComputeHash($stream))}finally{$stream.Dispose();$hasher.Dispose()}
    if($hash -ne (Get-FileHash -LiteralPath $file).Hash){throw 'Archive member mismatch'}
    $verified++
  }
}finally{$archive.Dispose()}
if($verified -ne $files.Count){throw 'Archive member count mismatch'}
$sha=(Get-FileHash -LiteralPath $destination).Hash.ToLowerInvariant()
($sha+'  '+[IO.Path]::GetFileName($destination)) | Out-File -LiteralPath ($destination+'.sha256') -Encoding ascii
$report=@{zip=$destination;sha256=$sha;bytes=(Get-Item -LiteralPath $destination).Length;verified_members=$verified;private_data_included=$false;uploaded=$false}
$report | ConvertTo-Json | Out-File -LiteralPath ($destination+'.verification.json') -Encoding utf8
$report | ConvertTo-Json -Compress
