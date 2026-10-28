/* Our adapter, MIT. Loaded only in the bundled, unchanged Yomitan search page. */
(() => {
  'use strict';
  if (location.pathname !== '/search.html' || !window.chrome?.webview) return;
  const context = __FG_CONTEXT__;
  const segments=Array.isArray(context.segments)&&context.segments.map(s=>s.text).join('')===context.sentence?context.segments:[];
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sentenceHtml=segments.map(s=>s.reading?'<ruby>'+escape(s.text)+'<rt>'+escape(s.reading)+'</rt></ruby>':escape(s.text)).join('');
  const sentencePlain=segments.map(s=>s.reading?' '+s.text+'['+s.reading+']':s.text).join('').trimStart();
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
  Promise.all([import(chrome.runtime.getURL('/js/comm/api.js')),import(chrome.runtime.getURL('/js/data/anki-note-builder.js'))]).then(([{API},{AnkiNoteBuilder}]) => {
    const parse=API.prototype.parseText;
    API.prototype.parseText=async function(text,...args){
      const result=await parse.call(this,text,...args);
      if(segments.length&&text===context.sentence)return result.map(r=>r.source==='scanning-parser'?{...r,content:segments.map(s=>[{text:s.text,reading:s.reading}])}:r);
      return result;
    };
    const furigana=AnkiNoteBuilder.prototype._getTextFurigana;
    AnkiNoteBuilder.prototype._getTextFurigana=async function(entries,...args){
      const inherited=segments.length?entries.filter(e=>e.text===context.sentence):[];
      const fallback=await furigana.call(this,entries.filter(e=>!inherited.includes(e)),...args);
      return [...fallback,...inherited.map(e=>({...e,detailsHtml:{value:sentenceHtml},detailsPlain:{value:sentencePlain}}))];
    };
    for(const method of ['addAnkiNote','updateAnkiNote']){
    const original = API.prototype[method];
    API.prototype[method] = async function(note) {
      const options = await this.optionsGetFull();
      if(segments.some(s=>s.reading)){
        const formats=options.profiles[options.profileCurrent].options.anki.cardFormats.filter(f=>f.model===note.modelName&&f.deck===note.deckName);
        const fields={...note.fields};
        for(const format of formats)for(const [name,setting]of Object.entries(format.fields)){
          const template=typeof setting==='string'?setting:setting.value||'';
          if(template.includes('{sentence}')&&typeof fields[name]==='string')fields[name]=fields[name].split(escape(context.sentence)).join(sentenceHtml);
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
  }).catch(error => { console.error('[Furigana Yomitan adapter]', error); document.documentElement.dataset.fgBridge = 'failed'; });
})();
