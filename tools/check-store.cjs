// Read-only distribution checks; also used against the generated store directory.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.resolve(process.argv[2]||path.join(root,'src'));
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),pkg=require('../package.json');
assert.equal(manifest.slug,'ncm-yotiman');assert.equal(manifest.version,pkg.version);assert.equal(manifest.manifest_version,1);
for(const key of ['name','author','author_link','description','preview','betterncm_version'])assert(manifest[key],'Missing '+key);
assert.deepEqual(manifest.requirements,['RefinedNowPlayingNext']);assert.equal(manifest.require_restart,true);assert.equal(manifest['ncm3-compatible'],true);
assert(!['force-install','force-update','force-uninstall'].some(k=>manifest[k]),'No forced market actions');
assert(fs.statSync(path.join(dir,manifest.preview)).size<200*1024,'Preview must stay small');
for(const item of manifest.injects.Main)assert(fs.statSync(path.join(dir,item.file)).isFile());
const licenseText=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
assert.equal(licenseText(path.join(dir,'LICENSE')),licenseText(path.join(root,'LICENSE')));
assert.equal(licenseText(path.join(dir,'NOTICE.md')),licenseText(path.join(root,'NOTICE.md')));
const main=fs.readFileSync(path.join(dir,'main.js'),'utf8');assert(main.includes('反馈问题')&&main.includes('源码仓库')&&main.includes('betterncm.ncm.openUrl'));
if(process.argv[2]){
 for(const name of ['CloudmusicYomitan.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll'])assert.equal(fs.readFileSync(path.join(dir,'yomitan-host',name)).subarray(0,2).toString(),'MZ','Missing built native component '+name);
 for(const name of ['anki-context.js','range-match.js','page-bridge.js','WebView2-LICENSE.txt','WebView2-NOTICE.txt','yomitan/legal.html','yomitan/legal-npm.html'])assert(fs.statSync(path.join(dir,'yomitan-host',name)).isFile());
 function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){assert(!entry.isSymbolicLink());const full=path.join(folder,entry.name);assert(!/^(profile|requests|node_modules|lyrics|tests|outputs|\.git)$/i.test(entry.name));assert(!/\.pdb$|term_bank_\d+\.json|\.plugin$/i.test(entry.name));if(entry.isDirectory())visit(full);}}
 visit(dir);
}
console.log('Store checks passed: identity, metadata, dependency, restart, preview, support links, licenses and built runtime when supplied.');
