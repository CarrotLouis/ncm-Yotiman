/* MIT; bounded Redux discovery adapted from CarrotLouis/jp-furigana. */
(()=>{
 'use strict';
 const KEY='ncm-yotiman.config',listeners=new Set();let dictionary=null,store=null;
 let saved={};try{saved=JSON.parse(localStorage.getItem(KEY))||{};}catch(_){ }
 if(!localStorage.getItem(KEY)){try{saved.dictionaryEnabled=!!JSON.parse(localStorage.getItem('jp-furigana-plus.config')||'{}').dictionaryEnabled;}catch(_){ }}
 const config={dictionaryEnabled:false,...saved};
 if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(config));
 const notify=()=>{for(const fn of listeners)fn();};
 function set(key,value){if(key!=='dictionaryEnabled')throw new Error('未知设置项');config[key]=!!value;localStorage.setItem(KEY,JSON.stringify(config));notify();}
 function findStore(){
  const looks=v=>v&&typeof v.getState==='function'&&typeof v.dispatch==='function';
  for(const selector of ['#root','#portal_root','body']){
   const element=document.querySelector(selector);if(!element)continue;
   const key=Object.keys(element).find(k=>k.startsWith('__reactContainer$')||k.startsWith('__reactFiber$'));
   const root=key?element[key]:element._reactRootContainer&&element._reactRootContainer._internalRoot&&element._reactRootContainer._internalRoot.current;
   const queue=root?[root]:[],seen=new Set();let budget=6000;
   while(queue.length&&budget--){const f=queue.shift();if(!f||seen.has(f))continue;seen.add(f);
    for(const value of [f.memoizedProps,f.memoizedState]){for(const v of [value,value&&value.store,value&&value.value,value&&value.value&&value.value.store]){if(looks(v))return v;}}
    if(f.child)queue.push(f.child);if(f.sibling)queue.push(f.sibling);
   }
  }return null;
 }
 function track(){
  const plus=window.JPFuriganaPlus;
  if(!store)store=plus&&plus.state&&plus.state.store||findStore();
  let playing;try{playing=store&&store.getState().playing;}catch(_){store=null;}
  const current=playing&&(playing.curTrack||playing.playingTrack||playing.track||playing.resourceTrack);
  const id=playing&&(playing.resourceTrackId||playing.trackId||current&&(current.id||current.trackId))||plus&&plus.trackId&&plus.trackId();
  return id?{id:String(id),title:current&&current.name?current.name+' — '+(current.ar||current.artists||[]).map(a=>a.name).filter(Boolean).join(' / '):document.title}:null;
 }
 async function probe(){
  const helper=plugin.pluginPath+'/yomitan-host/CloudmusicYomitan.exe';
  return {build:'ncm-Yotiman 0.1.0',enabled:config.dictionaryEnabled,helperExists:await betterncm.fs.exists(helper),hasTrack:!!track(),lyricLines:document.querySelectorAll(NcmYotimanSelection.LINES).length,gesture:dictionary&&dictionary.diagnostics(),error:dictionary&&dictionary.status()};
 }
 function panel(){
  const root=document.createElement('section');root.style.cssText='font-size:14px;line-height:1.8;padding:12px';
  root.innerHTML='<h2>ncm-Yotiman · Yomitan 歌词词典</h2><label><input type="checkbox"> 启用词典</label><p><button data-settings>打开 Yomitan 设置</button> <button data-check>运行检查</button></p><p>按住 Shift 从歌词字面开始拖选，松开鼠标查词。当前振假名和人工纠音会随整句传给制卡功能。</p><p>Anki 句子字段可使用 {sentence} 或 {sentence-furigana}；声音可在查词窗口手动附加 ShareX 已录制的音频。</p><p><a href="#">源码与问题反馈</a></p><pre role="status" style="white-space:pre-wrap"></pre>';
  const input=root.querySelector('input');input.checked=config.dictionaryEnabled;input.onchange=()=>set('dictionaryEnabled',input.checked);
  const status=root.querySelector('[role=status]');
  root.querySelector('[data-settings]').onclick=()=>dictionary&&dictionary.openSettings().catch(e=>{status.textContent=e.message;});
  root.querySelector('[data-check]').onclick=()=>probe().then(value=>{status.textContent=JSON.stringify(value,null,2);}).catch(e=>{status.textContent=e.message;});
  root.querySelector('a').onclick=e=>{e.preventDefault();betterncm.ncm.openUrl('https://github.com/CarrotLouis/ncm-Yotiman');};
  return root;
 }
 plugin.onConfig(panel);
 let started=false;
 async function start(plugins){
  if(started)return;started=true;
  // The earlier combined experiment has its own event listeners. Transfer the
  // enabled preference once, then stop that adapter so a gesture opens one window.
  const hasPlus=Object.values(plugins||window.loadedPlugins||{}).some(p=>p&&p.manifest&&p.manifest.slug==='jp-furigana-plus');
  if(hasPlus)for(let i=0;i<30&&!window.JPFuriganaPlus;i++)await new Promise(r=>setTimeout(r,100));
  const legacy=window.JPFuriganaPlus;
  if(legacy&&legacy.dictionary){legacy.dictionary.destroy();legacy.set('dictionaryEnabled',false);legacy.dictionary=null;}
  dictionary=NcmYotimanDictionary.install({betterncm,plugin,config:()=>config,set,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},track,error:text=>console.warn('[ncm-Yotiman]',text)});
  window.NcmYotiman={config,set,track,probe,dictionary,build:'0.1.0'};
  console.log('[ncm-Yotiman] Loaded; dictionary '+(config.dictionaryEnabled?'enabled':'disabled'));
 }
 if(typeof plugin.onAllPluginsLoaded==='function')plugin.onAllPluginsLoaded(start);else plugin.onLoad(()=>start(window.loadedPlugins));
})();
