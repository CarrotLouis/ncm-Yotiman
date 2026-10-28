/* Our adapter, MIT. Loaded only in the bundled, unchanged Yomitan search page. */
(() => {
  'use strict';
  if (location.pathname !== '/search.html' || !window.chrome?.webview) return;
  let context = __FG_CONTEXT__;
  let segments=[],sentenceHtml='',sentencePlain='',nextQuery=null;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function applyTheme(){const theme=context.theme==='light'?'light':'dark',root=document.documentElement;if(!root)return;for(const key of ['theme','outerTheme','siteTheme'])if(root.dataset[key]!==theme)root.dataset[key]=theme;root.style.colorScheme=theme;}
  function setContext(value){context=value;segments=Array.isArray(value.segments)&&value.segments.map(s=>s.text).join('')===value.sentence?value.segments:[];sentenceHtml=segments.map(s=>s.reading?'<ruby>'+escape(s.text)+'<rt>'+escape(s.reading)+'</rt></ruby>':escape(s.text)).join('');sentencePlain=segments.map(s=>s.reading?' '+s.text+'['+s.reading+']':s.text).join('').trimStart();applyTheme();}
  setContext(context);
  const style=document.createElement('style');style.textContent=`#above-sticky-header,#search-option-clipboard-monitor-container,#intro{display:none!important}html{font-size:16px}body{margin:0}.content{max-width:100%!important}.search-header{padding:12px 18px!important}#search-textbox{font-size:16px!important;border-radius:8px}#query-parser-container{padding-top:10px}.content-body-inner{padding:4px 18px 18px!important}.entry{border-radius:9px}#content-scroll{scrollbar-width:thin}`;
  function installChrome(){(document.head||document.documentElement).append(style);applyTheme();new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-outer-theme','data-site-theme']});}
  if(document.documentElement)installChrome();else document.addEventListener('DOMContentLoaded',installChrome,{once:true});
  // DisplayHistory reads this at construction; the original Anki templates then
  // receive the lyric as {sentence}, including the selected word's exact offset.
  history.replaceState({state: {
    sentence: {text: context.sentence, offset: context.offset},
    documentTitle: context.title, url: context.url,
  }}, '', location.href);
  const pending = new Map(); let serial = 0;
  chrome.webview.addEventListener('message', ({data}) => {
    const entry = pending.get(data.id); if (!entry) return;
    pending.delete(data.id); clearTimeout(entry.timer);
    data.error ? entry.reject(new Error(data.error)) : entry.resolve(data.audio);
  });
  function audioForNote(fields) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('音频附件读取超时，请重试')); }, 10000);
      pending.set(id, {resolve, reject, timer});
      chrome.webview.postMessage({id, action:'audioForNote', fields});
    });
  }
  // Reuse Yomitan's original add-note operation. A chosen ShareX file is sent
  // only when the user presses Yomitan's Add button, never during lookup.
  Promise.all([import(chrome.runtime.getURL('/js/comm/api.js')),import(chrome.runtime.getURL('/js/data/anki-note-builder.js')),import(chrome.runtime.getURL('/js/display/display.js')),import(chrome.runtime.getURL('/js/comm/clipboard-monitor.js'))]).then(([{API},{AnkiNoteBuilder},{Display},{ClipboardMonitor}]) => {
    // The embedded page receives explicit lyric requests. A copied clipboard
    // must never replace that request, even if the user's browser profile scans it.
    ClipboardMonitor.prototype.start=function(){};
    const setContent=Display.prototype.setContent;
    Display.prototype.setContent=function(details){
      if(nextQuery!==null&&details.params.query===nextQuery){nextQuery=null;details={...details,params:{...details.params,full:context.sentence,offset:String(context.offset)},state:{...details.state,sentence:{text:context.sentence,offset:context.offset},documentTitle:context.title,url:context.url}};}
      return setContent.call(this,details);
    };
    const find=API.prototype.termsFind;
    API.prototype.termsFind=async function(query,...args){try{return await find.call(this,query,...args);}finally{chrome.webview.postMessage({action:'lookupComplete',query});}};
    window.NcmYotimanLookup=value=>{if(document.documentElement.dataset.loaded!=='true')return false;setContext(value);nextQuery=value.term;document.querySelector('#search-textbox').value=value.term;document.querySelector('#search-button').click();return true;};
    const ready=()=>{if(document.documentElement.dataset.loaded==='true'){chrome.webview.postMessage({action:'pageReady'});return true;}return false;};
    if(!ready()){const observer=new MutationObserver(()=>{if(ready())observer.disconnect();});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-loaded']});}
    const parse=API.prototype.parseText;
    API.prototype.parseText=async function(text,...args){
      const expected=context.sentence,readings=segments;
      const result=await parse.call(this,text,...args);
      if(readings.length&&text===expected)return result.map(r=>r.source==='scanning-parser'?{...r,content:readings.map(s=>[{text:s.text,reading:s.reading}])}:r);
      return result;
    };
    const furigana=AnkiNoteBuilder.prototype._getTextFurigana;
    AnkiNoteBuilder.prototype._getTextFurigana=async function(entries,...args){
      const html=sentenceHtml,plain=sentencePlain;
      const inherited=segments.length?entries.filter(e=>e.text===context.sentence):[];
      const fallback=await furigana.call(this,entries.filter(e=>!inherited.includes(e)),...args);
      return [...fallback,...inherited.map(e=>({...e,detailsHtml:{value:html},detailsPlain:{value:plain}}))];
    };
    for(const method of ['addAnkiNote','updateAnkiNote']){
    const original = API.prototype[method];
    API.prototype[method] = async function(note) {
      const snapshot=context,readings=segments,html=sentenceHtml;
      const options = await this.optionsGetFull();
      if(readings.some(s=>s.reading)){
        const formats=options.profiles[options.profileCurrent].options.anki.cardFormats.filter(f=>f.model===note.modelName&&f.deck===note.deckName);
        const fields={...note.fields};
        for(const format of formats)for(const [name,setting]of Object.entries(format.fields)){
          const template=typeof setting==='string'?setting:setting.value||'';
          if(template.includes('{sentence}')&&typeof fields[name]==='string')fields[name]=fields[name].split(escape(snapshot.sentence)).join(html);
        }
        note={...note,fields};
      }
      const audio = await audioForNote(Object.keys(note.fields));
      if (audio) {
        const anki = options.profiles[options.profileCurrent].options.anki;
        const response = await fetch(anki.server, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'storeMediaFile', version:6, key:anki.apiKey,
            params:{filename:audio.filename, data:audio.data}}),
          signal:AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Anki 音频上传失败：HTTP ' + response.status);
        const result = await response.json();
        if (result.error || result.result !== audio.filename) throw new Error(result.error || 'Anki 未确认保存音频');
        note = {...note, fields:{...note.fields, [audio.field]:note.fields[audio.field] + '[sound:' + audio.filename + ']'}};
      }
      return original.call(this, note);
    };
    }
    document.documentElement.dataset.fgBridge = 'ready';
  }).catch(error => { console.error('[Furigana Yomitan adapter]', error); document.documentElement.dataset.fgBridge = 'failed';document.documentElement.dataset.fgBridgeError=error.message; });
})();
