'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {buildZip}=require('./zip.cjs');
const root=path.resolve(__dirname,'..'),src=path.join(root,'src'),manifest=require('../src/manifest.json');
const entries=[];
function collect(full,name){const stat=fs.lstatSync(full);assert(!stat.isSymbolicLink(),'Do not package links');if(stat.isDirectory()){for(const child of fs.readdirSync(full).sort())collect(path.join(full,child),name?name+'/'+child:child);}else entries.push({name,data:fs.readFileSync(full),mtime:stat.mtime});}
for(const name of ['manifest.json','main.js','selection.js','dictionary.js',manifest.preview,'LICENSE','NOTICE.md','yomitan-host']){
 assert(fs.existsSync(path.join(src,name)),'Missing '+name+'; build the companion first');collect(path.join(src,name),name);
}
assert(entries.some(e=>e.name==='yomitan-host/yomitan/sw.js'));
assert(entries.some(e=>e.name==='yomitan-host/range-match.js'),'Missing range matching companion');
assert(entries.some(e=>e.name==='yomitan-host/anki-context.js'),'Missing Anki context companion');
assert(entries.every(e=>!e.name.includes('\\')&&!/profile\/|requests\/|term_bank_|\.pdb$/.test(e.name)),'Private data or build debug files in package');
for(const entry of manifest.injects.Main)assert(entries.some(e=>e.name===entry.file));
const output=path.join(root,'builds','ncm-yotiman-'+manifest.version+'.plugin');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,buildZip(entries));
console.log('Built '+path.basename(output)+' · '+entries.length+' files · '+(fs.statSync(output).size/1048576).toFixed(2)+' MB');
