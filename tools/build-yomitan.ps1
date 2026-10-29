param([Parameter(Mandatory=$true)][string]$YomitanArchive)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$archivePath=(Resolve-Path -LiteralPath $YomitanArchive).Path
if((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne '270BF736862624A6F66D86CE6EFB3E76307DF4A6AD034073134897DE8A414AA7'){throw 'Use official Yomitan 26.10.12.0 yomitan-chrome.zip; hash mismatch.'}
& dotnet build (Join-Path $projectRoot 'companion/yomitan/CloudmusicYomitan.csproj') -c Release --nologo -v minimal
if($LASTEXITCODE -ne 0){throw 'Companion build failed'}
$targetDir=Join-Path $projectRoot 'src/yomitan-host'
New-Item -ItemType Directory -Path $targetDir -Force|Out-Null
$builtDir=Join-Path $projectRoot 'companion/yomitan/bin/Release/net48'
foreach($name in @('CloudmusicYomitan.exe','CloudmusicYomitan.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','page-bridge.js','range-match.js','anki-context.js')){Copy-Item -LiteralPath (Join-Path $builtDir $name) -Destination $targetDir -Force}
$extensionDir=Join-Path $targetDir 'yomitan'
if(!(Test-Path -LiteralPath $extensionDir)){Expand-Archive -LiteralPath $archivePath -DestinationPath $extensionDir}
Copy-Item -LiteralPath (Join-Path $projectRoot 'companion/yomitan/NOTICE.md') -Destination $targetDir -Force
$nugetRoot=if($env:NUGET_PACKAGES){$env:NUGET_PACKAGES}else{Join-Path ([Environment]::GetFolderPath('UserProfile')) '.nuget/packages'}
$webviewPackage=Join-Path $nugetRoot 'microsoft.web.webview2/1.0.2903.40'
Copy-Item -LiteralPath (Join-Path $webviewPackage 'LICENSE.txt') -Destination (Join-Path $targetDir 'WebView2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $webviewPackage 'NOTICE.txt') -Destination (Join-Path $targetDir 'WebView2-NOTICE.txt') -Force
Write-Output 'Local companion prepared. Nothing installed or published.'
