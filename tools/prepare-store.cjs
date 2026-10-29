// Builds a clean store snapshot. Output must be new; no working tree is removed.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'outputs','store'),manifest=require('../src/manifest.json');
const archive=process.argv[2],source=process.argv[3];assert(archive&&source,'Pass the pinned binary ZIP and corresponding source tar.gz');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(archive),'270bf736862624a6f66d86ce6efb3e76307df4a6ad034073134897de8a414aa7');
assert(!fs.existsSync(output),'Store output exists; use a fresh build directory');fs.mkdirSync(output,{recursive:true});
const plugin=path.join(output,'plugin');fs.mkdirSync(plugin);
for(const name of ['manifest.json','main.js','selection.js','dictionary.js',manifest.preview,'LICENSE','NOTICE.md','yomitan-host'])fs.cpSync(path.join(root,'src',name),path.join(plugin,name),{recursive:true,dereference:false});
cp.execFileSync(process.execPath,[path.join(root,'tools/check-store.cjs'),plugin],{stdio:'inherit'});
const sources=path.join(output,'sources');fs.mkdirSync(sources);
const sourceName='yomitan-e7334a96106a6c74e6fa75bd33a5ea1219d92712.tar.gz';fs.copyFileSync(source,path.join(sources,sourceName));
const git=(...args)=>cp.execFileSync('git',['-c','safe.directory='+root,...args],{cwd:root,encoding:'utf8'});
const commit=git('rev-parse','HEAD').trim();
git('archive','--format=zip','--output='+path.join(sources,'ncm-yotiman-'+manifest.version+'.zip'),commit);
const files={};function walk(folder,prefix=''){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())walk(path.join(folder,entry.name),name+'/');else files[name]=hash(path.join(folder,entry.name));}}
const base='https://github.com/CarrotLouis/ncm-Yotiman',sourceLink=base+'/raw/refs/heads/store/sources/'+sourceName;
fs.writeFileSync(path.join(output,'README.md'),'# Yomitan 歌词词典：商店构建\n\n此分支仅由 GitHub Actions 发布，商店抓取 `/plugin`。\n\n- [本次源码]('+base+'/tree/'+commit+')\n- [构建记录]('+(process.env.GITHUB_RUN_ID?base+'/actions/runs/'+process.env.GITHUB_RUN_ID:base+'/actions')+')\n- [插件本体和原生辅助程序对应源码](sources/ncm-yotiman-'+manifest.version+'.zip)\n- [Yomitan 26.10.12.0 对应源码](sources/'+sourceName+')，GPL-3.0-or-later；与二进制同时提供，免费、无需登录。\n- [文件校验和及源码版本](build-info.json)\n- [使用说明]('+base+') · [问题反馈]('+base+'/issues)\n');
fs.writeFileSync(path.join(plugin,'CORRESPONDING-SOURCE.txt'),'Corresponding Source is available without charge:\n'+sourceLink+'\nPlugin/host source: '+base+'/raw/refs/heads/store/sources/ncm-yotiman-'+manifest.version+'.zip\nBuild and notices: '+base+'/tree/store\nYomitan: GPL-3.0-or-later. See yomitan-host/yomitan/legal.html and legal-npm.html.\nThe adapter is MIT; this does not relicense Yomitan.\n');
walk(plugin);
fs.writeFileSync(path.join(output,'build-info.json'),JSON.stringify({version:manifest.version,sourceCommit:commit,workflow:process.env.GITHUB_RUN_ID?base+'/actions/runs/'+process.env.GITHUB_RUN_ID:null,yomitan:{version:'26.10.12.0',commit:'e7334a96106a6c74e6fa75bd33a5ea1219d92712',binarySha256:hash(archive),sourceSha256:hash(source)},files},null,2)+'\n');
console.log('Prepared '+output);
