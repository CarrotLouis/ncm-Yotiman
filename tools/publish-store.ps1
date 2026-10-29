# Publish only the complete output built by this job; preserve branch history.
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$storeOutput=Join-Path $repoRoot 'outputs/store'
if(!(Test-Path -LiteralPath (Join-Path $storeOutput 'build-info.json'))){throw 'Store output not prepared'}
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
$remote=git ls-remote --heads origin refs/heads/store
if($LASTEXITCODE -ne 0){throw 'Cannot inspect store branch'}
$parent=$null
if($remote){git fetch --no-tags origin store; if($LASTEXITCODE -ne 0){throw 'Cannot fetch store branch'}; $parent=git rev-parse FETCH_HEAD}
$env:GIT_INDEX_FILE=Join-Path $env:RUNNER_TEMP 'ncm-yotiman-store-index'
try{
 git read-tree --empty
 if($LASTEXITCODE -ne 0){throw 'Cannot create store index'}
 git --work-tree=$storeOutput add --all
 if($LASTEXITCODE -ne 0){throw 'Cannot stage store snapshot'}
 $tree=git write-tree
 if($LASTEXITCODE -ne 0){throw 'Cannot write store tree'}
 $message='Store build '+$env:GITHUB_SHA
 $commit=if($parent){git commit-tree $tree -p $parent -m $message}else{git commit-tree $tree -m $message}
 if($LASTEXITCODE -ne 0){throw 'Cannot create store commit'}
 git push origin "${commit}:refs/heads/store"
 if($LASTEXITCODE -ne 0){throw 'Cannot publish store branch'}
}finally{Remove-Item Env:GIT_INDEX_FILE}
