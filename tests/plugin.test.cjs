'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const manifest=require('../src/manifest.json'),pkg=require('../package.json');
assert.equal(manifest.slug,'ncm-yotiman');assert.equal(manifest.version,pkg.version);
const dom=new JSDOM('<body><div class="rnp-settings-menu"><div class="rnp-settings-menu-tabs"><div data-tab="lyric"></div><div data-tab="jp-furigana-plus"></div><div data-tab="font"></div></div><div class="rnp-settings-menu-inner"><div class="rnp-group" data-tab="lyric"></div><div class="rnp-group" data-tab="jp-furigana-plus"></div><div class="rnp-group" data-tab="font"></div></div></div></body>',{url:'https://music.163.com',runScripts:'outside-only',pretendToBeVisual:true});
const win=dom.window,handlers={};let stopped=0;
win.localStorage.setItem('jp-furigana-plus.config',JSON.stringify({dictionaryEnabled:true,enabled:true}));
win.JPFuriganaPlus={state:{store:{getState:()=>({playing:{resourceTrackId:'42',curTrack:{name:'試験曲',artists:[{name:'試験歌手'}]}}})}},dictionary:{destroy:()=>stopped++},set(key,value){assert.equal(key,'dictionaryEnabled');assert.equal(value,false);}};
win.plugin={pluginPath:'C:/plugin',onAllPluginsLoaded:fn=>handlers.start=fn,onConfig:fn=>handlers.panel=fn};
win.betterncm={fs:{exists:async()=>true},ncm:{openUrl(){}},app:{getDataPath:async()=> 'C:/BetterNCM'}};
for(const entry of manifest.injects.Main)win.eval(fs.readFileSync(path.resolve(__dirname,'../src',entry.file),'utf8'));
(async()=>{
 await handlers.start();assert.equal(stopped,1);assert(win.NcmYotiman.config.dictionaryEnabled);
 assert(JSON.parse(win.localStorage.getItem('ncm-yotiman.config')).dictionaryEnabled,'Persist migration before disabling the old adapter');
 const menu=win.document.querySelector('.rnp-settings-menu');
 assert.deepEqual([...menu.querySelector('.rnp-settings-menu-tabs').children].map(n=>n.dataset.tab),['lyric','jp-furigana-plus','ncm-yotiman','font']);
 assert.deepEqual(win.NcmYotiman.track().id,'42');
 const status=await win.NcmYotiman.probe();assert(status.helperExists&&status.hasTrack);assert(!JSON.stringify(status).includes('試験曲'));
 const panel=handlers.panel();assert(panel.textContent.includes('Yomitan'));assert(panel.querySelector('input').checked);
 // No writes to the furigana config; migration never changes annotation settings.
 assert(JSON.parse(win.localStorage.getItem('jp-furigana-plus.config')).enabled);
 win.NcmYotiman.dictionary.destroy();win.close();console.log('Plugin passed: independent identity/config, old adapter handoff, RNP placement, current metadata, non-sensitive diagnostics and settings.');
})().catch(e=>{console.error(e);process.exitCode=1;win.close();});
