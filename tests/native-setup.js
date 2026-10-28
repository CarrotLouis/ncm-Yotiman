/* Executed only by the private native smoke runner, with a dedicated profile. */
(async()=>{
 try{
  const {API}=await import('/js/comm/api.js');
  const {WebExtension}=await import('/js/extension/web-extension.js');
  const {DictionaryWorker}=await import('/js/dictionary/dictionary-worker.js');
  const {DictionaryController}=await import('/js/pages/settings/dictionary-controller.js');
  const api=new API(new WebExtension());
  let infos=await api.getDictionaryInfo();
  if(infos.length===0){
   const data=await(await fetch('https://ncm-yotiman-test.invalid/dictionary.zip')).arrayBuffer();
   const started=performance.now();
   const imported=await new DictionaryWorker().importDictionary(data,{prefixWildcardsSupported:false,yomitanVersion:'26.10.12.0'},()=>{});
   if(!imported.result||imported.errors.length)throw new Error('Dictionary import failed');
   chrome.webview.postMessage({stage:'imported',ms:Math.round(performance.now()-started),counts:imported.result.counts});
   await api.triggerDatabaseUpdated('dictionary','import');infos=await api.getDictionaryInfo();
  }
  const opts=await api.optionsGetFull(),p=opts.profiles[opts.profileCurrent].options;
  p.dictionaries=infos.map(d=>DictionaryController.createDefaultDictionarySettings(d.title,true,d.styles));
  Object.assign(p.anki,{enable:true,server:'http://127.0.0.1:18766',apiKey:'',noteDupeCheckFirst:false,forceSync:false});
  const fields={};for(const [key,value]of Object.entries({Expression:'{expression}',Sentence:'{sentence}',SentenceRuby:'{sentence-furigana}',SentencePlain:'{sentence-furigana-plain}',SentenceAudio:'',Source:'{document-title}'}))fields[key]={value,overwriteMode:'coalesce'};
  p.anki.cardFormats=[{name:'Smoke',icon:'big-circle',deck:'Smoke',model:'Smoke',type:'term',fields}];
  await api.setAllSettings(opts,'native-smoke');
  window.__ncmSmoke='configured';
 }catch(e){window.__ncmSmoke='ERROR: '+e.message;chrome.webview.postMessage({stage:'error',error:e.message});}
})();
