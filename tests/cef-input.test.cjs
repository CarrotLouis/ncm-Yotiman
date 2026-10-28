'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {install}=require('../src/dictionary.js'),capture=require('../src/selection.js');
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const dom=new JSDOM('<body><div class="rnp-lyrics-line"><div class="rnp-lyrics-line-original">戀人と歌う</div></div><input></body>',{pretendToBeVisual:true});
 const win=dom.window,doc=win.document,line=doc.querySelector('.rnp-lyrics-line-original'),text=line.firstChild;
 // CEF can expose the constructor while its embedder sends mouse events only.
 win.PointerEvent=win.MouseEvent;const sent=[];
 doc.caretRangeFromPoint=x=>{const r=doc.createRange();r.setStart(text,x<5?0:2);r.collapse(true);return r;};
 const adapter=install({config:()=>({dictionaryEnabled:true}),subscribe:()=>()=>{},set(){},track:()=>({id:'42'}),transport:{send:async(action,context)=>{if(action==='lookup')sent.push(context);}}},doc);
 function event(type,x,shiftKey=true,target=line){target.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:10,shiftKey}));}
 event('mousedown',0);event('mousemove',10);event('mouseup',10);await tick();assert.equal(sent.length,1,'Mouse input must work even with a PointerEvent constructor');
 event('pointerdown',0);event('mousedown',0);event('pointermove',10);event('mousemove',10);event('pointerup',10);event('mouseup',10);await tick();assert.equal(sent.length,2,'Compatibility events must not submit a second lookup');
 win.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Shift',bubbles:true}));
 event('mousedown',0,false);event('mousemove',10,false);event('mouseup',10,false);await tick();assert.equal(sent.length,3,'Keyboard state survives missing Shift flags on CEF mouse input');
 doc.querySelector('input').dispatchEvent(new win.KeyboardEvent('keyup',{key:'Shift',bubbles:true}));
 event('mousedown',0,false);event('mousemove',10,false);event('mouseup',10,false);await tick();assert.equal(sent.length,3,'Shift released over an input must not remain stuck');
 assert(capture.lineForTarget(line.parentElement)===line,'RNP row hit targets resolve to original text');
 const native=doc.createElement('div');native.className='native-current-line';native.__fgText='戀人';native.__fgHosts=[];native.innerHTML='<span class="fg-line">戀人</span>';doc.body.append(native);
 assert.equal(capture.lineForTarget(native.firstElementChild),native,'Annotated lines can be recognized without a fixed class name');
 assert(capture.lines(doc).includes(native));assert(native.hasAttribute('data-ncm-yotiman-line'));
 assert(adapter.diagnostics().input.mousedown>0);assert.equal(adapter.diagnostics().lastInput.shift,false);
 adapter.destroy();assert(!doc.body.classList.contains('ncm-yotiman-enabled'));win.close();
 console.log('CEF input passed: exposed-but-unused PointerEvent, dual-stream dedupe, missing mouse Shift flags, key release, row targets and furigana line discovery.');
})().catch(e=>{console.error(e);process.exitCode=1;});
