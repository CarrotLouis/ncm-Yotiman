'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>');let receive;const notes=[];
const snapshot={sentence:'戀人と歌う',offset:3,title:'試験曲',url:'https://music.163.com/song?id=42',segments:[{text:'戀人',reading:'あなた'},{text:'と歌う',reading:''}]};
class FakeAPI{
 optionsGetFull(){return Promise.resolve({profileCurrent:0,profiles:[{options:{anki:{cardFormats:[{model:'Model',deck:'Deck',fields:{Sentence:{value:'{sentence}'},Meaning:{value:'{glossary}'}}}]}}}]});}
 addAnkiNote(note){notes.push({action:'add',note});return 42;}
 updateAnkiNote(note){notes.push({action:'update',note});return null;}
 parseText(){return Promise.resolve([{source:'scanning-parser',content:[[{text:snapshot.sentence,reading:'wrong'}]]}]);}
}
class FakeBuilder{_getTextFurigana(){return Promise.resolve([]);}}
const chrome={runtime:{getURL:x=>x},webview:{addEventListener:(type,listener)=>{receive=listener;},postMessage:message=>queueMicrotask(()=>receive({data:{id:message.id,audio:null}}))}};
let source=fs.readFileSync(require.resolve('../companion/yomitan/page-bridge.js'),'utf8').replace('__FG_CONTEXT__',JSON.stringify(snapshot));
const imports="Promise.all([import(chrome.runtime.getURL('/js/comm/api.js')),import(chrome.runtime.getURL('/js/data/anki-note-builder.js'))])";
assert(source.includes(imports));source=source.replace(imports,'Promise.resolve([{API:FakeAPI},{AnkiNoteBuilder:FakeBuilder}])');
vm.runInNewContext(source,{FakeAPI,FakeBuilder,window:{chrome},chrome,document:dom.window.document,location:{pathname:'/search.html',href:'https://test.invalid'},history:{replaceState(){}},setTimeout,clearTimeout,console});
(async()=>{
 await new Promise(r=>setTimeout(r,0));assert.equal(dom.window.document.documentElement.dataset.fgBridge,'ready');
 const api=new FakeAPI(),note={modelName:'Model',deckName:'Deck',fields:{Sentence:snapshot.sentence,Meaning:'untouched'}};
 await api.addAnkiNote(note);await api.updateAnkiNote({...note,id:42});
 for(const {note:sent}of notes){assert.equal(sent.fields.Sentence,'<ruby>戀人<rt>あなた</rt></ruby>と歌う');assert.equal(sent.fields.Meaning,'untouched');}
 assert.equal(notes[1].note.id,42);
 const rows=await new FakeBuilder()._getTextFurigana([{text:snapshot.sentence,readingMode:null}]);
 assert.equal(rows[0].detailsHtml.value,notes[0].note.fields.Sentence);assert.equal(rows[0].detailsPlain.value,'戀人[あなた]と歌う');
 const parsed=await api.parseText(snapshot.sentence);assert.equal(parsed[0].content[0][0].reading,'あなた');
 dom.window.close();console.log('Bridge passed: inherited readings in add/update notes, unrelated fields preserved, sentence HTML/plain and query parser.');
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close();});
