'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const capture=require('../src/selection.js'),{install}=require('../src/dictionary.js');
const dom=new JSDOM('<body><div class="rnp-lyrics-line-original">私は<span class="fg-ruby"><ruby>戀人<rt><span class="fg-reading">あなた</span><del>こいびと</del></rt></ruby></span>と歌う。</div><div class="rnp-lyrics-line-translated">译文</div></body>',{pretendToBeVisual:true});
const win=dom.window,doc=win.document,line=doc.querySelector('.rnp-lyrics-line-original'),ruby=line.querySelector('ruby'),text=ruby.firstChild;
const nodes=new Map([[line.firstChild,0],[text,40],[line.lastChild,80]]);
win.Range.prototype.getClientRects=function(){
 const left=nodes.get(this.startContainer);if(left===undefined||this.startContainer!==this.endContainer)return [];
 const x=left+this.startOffset*20,width=(this.endOffset-this.startOffset)*20;
 return [{left:x,right:x+width,top:10,bottom:50,width,height:40}];
};
doc.caretRangeFromPoint=x=>{const r=doc.createRange();r.setStart(text,Math.max(0,Math.min(2,Math.round((x-40)/20))));r.collapse(true);return r;};
const point=x=>({target:ruby,clientX:x,clientY:30});
assert.equal(capture.fromPoint(doc,point(58)).offset,2,'Right half of a glyph must scan the character under the cursor');
assert.equal(capture.fromPoint(doc,point(78)).offset,2,'Hover anywhere in a furigana unit must select the whole word');
assert.equal(capture.fromPoint(doc,point(210)),null,'Hover outside the text must not clamp to the last character');
assert.equal(capture.fromPoint(doc,{...point(58),target:doc.querySelector('.rnp-lyrics-line-translated')}),null);
const nativeCaret=doc.caretRangeFromPoint;doc.caretRangeFromPoint=()=>null;
assert.equal(capture.fromPoint(doc,point(58)).offset,2,'Glyph geometry also supports hover without a caret API');doc.caretRangeFromPoint=nativeCaret;
const sent=[],config={dictionaryEnabled:true,dictionaryInputMode:'hover'};let trackDelay=null,changed;
const adapter=install({config:()=>config,subscribe:fn=>{changed=fn;return()=>{};},set(){},track:()=>trackDelay||{id:'42'},transport:{send:async(action,context)=>{if(action==='lookup')sent.push(context);}}},doc);
const tick=(ms=220)=>new Promise(r=>setTimeout(r,ms));
function move(x,shiftKey=false,type='mousemove'){ruby.dispatchEvent(new win.MouseEvent(type,{bubbles:true,clientX:x,clientY:30,shiftKey,buttons:0}));}
function key(type){win.dispatchEvent(new win.KeyboardEvent(type,{key:'Shift',shiftKey:type==='keydown'}));}
(async()=>{
 move(58);await tick();assert.equal(sent.length,0,'Ordinary hover must not look up text');
 key('keydown');await tick();assert.equal(sent.length,1,'Pressing Shift over stationary text must work without a mouse button');
 assert.equal(sent[0].term,'戀人');assert.equal(sent[0].offset,2);assert(sent[0].segments.some(s=>s.text==='戀人'&&s.reading==='あなた'));
 assert.equal(capture.plain(win.getSelection().getRangeAt(0).cloneContents()),'戀人');assert(line.hasAttribute('data-ncm-yotiman-highlight'));assert(ruby.classList.contains('ncm-yotiman-word'));
 assert.equal(adapter.diagnostics().down,0);assert.equal(adapter.diagnostics().hover,1);
 move(58,true,'pointermove');move(58,true);move(59,true);await tick();assert.equal(sent.length,1,'Pointer/mouse compatibility streams and jitter must not duplicate a lookup');
 key('keyup');move(78);key('keydown');key('keyup');await tick();assert.equal(sent.length,1,'Releasing Shift before the dwell completes cancels hover');
 key('keydown');win.dispatchEvent(new win.Event('blur'));await tick();assert.equal(sent.length,1,'Losing focus cancels pending hover');
 move(58,true);config.dictionaryEnabled=false;adapter.setEnabled(false);await tick();assert.equal(sent.length,1,'Disabling cancels pending hover');
 config.dictionaryEnabled=true;adapter.setEnabled(true);
 function drag(type,x,buttons){ruby.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:30,shiftKey:true,button:0,buttons}));}
 drag('mousedown',40,1);drag('mousemove',80,1);drag('mouseup',80,0);await tick();assert.equal(sent.length,1,'Hover-only mode must not also submit mouse drags');
 config.dictionaryInputMode='drag';changed();move(58,true);await tick();assert.equal(sent.length,1,'Drag-only mode must not scan on hover');
 config.dictionaryInputMode='both';changed();
 move(58,true);drag('mousedown',40,1);drag('mousemove',80,1);drag('mouseup',80,0);await tick();assert.equal(sent.length,2);assert.equal(sent[1].term,'戀人','Explicit drag still submits its exact selection');
 key('keyup');move(58);key('keydown');config.dictionaryInputMode='drag';changed();await tick();assert.equal(sent.length,2,'Changing input mode cancels an already scheduled hover');config.dictionaryInputMode='hover';changed();
 key('keyup');move(78);let release;trackDelay=new Promise(resolve=>release=resolve);key('keydown');await tick(200);key('keyup');release({id:'42'});await tick(20);assert.equal(sent.length,2,'Shift release also cancels while track metadata is pending');
 assert(!JSON.stringify(sent).includes('こいびと'));adapter.destroy();win.close();
 console.log('Hover passed: Shift-only scanning, caret boundaries/geometry, current readings, dwell cancellation, dual-stream dedupe and explicit drag.');
})().catch(e=>{console.error(e);process.exitCode=1;adapter.destroy();win.close();});
