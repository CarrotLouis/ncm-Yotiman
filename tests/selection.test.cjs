'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const capture=require('../src/selection.js'),{install}=require('../src/dictionary.js');
const dom=new JSDOM('<body><div class="rnp-lyrics-line-karaoke">私は<span class="fg-ruby"><ruby>戀人<rt class="fg-rt"><span class="fg-edit-stack"><span class="fg-reading fg-edit-custom">あなた</span><del class="fg-edit-original">こいびと</del></span></rt></ruby></span>と<span class="rnp-karaoke-word"><span><ruby>歌<rt>うた</rt></ruby>う</span><span class="rnp-karaoke-word-filler">歌う</span></span>。<span class="fg-hide">（うたう）</span></div><div class="rnp-lyrics-line-original">次の行</div></body>',{pretendToBeVisual:true});
const doc=dom.window.document,line=doc.querySelector('.rnp-lyrics-line-karaoke'),song=line.querySelector('.rnp-karaoke-word > span'),start=song.querySelector('ruby').firstChild,end=song.lastChild;
function choose(a,from,b,to){const range=doc.createRange();range.setStart(a,from);range.setEnd(b,to);const s=dom.window.getSelection();s.removeAllRanges();s.addRange(range);return s;}
const snapshot=capture.snapshot(line);assert.equal(snapshot.sentence,'私は戀人と歌う。');assert(snapshot.segments.some(s=>s.text==='戀人'&&s.reading==='あなた'));assert(!JSON.stringify(snapshot).includes('こいびと'));
const context=capture.fromSelection(choose(start,0,end,1),doc);assert.equal(context.offset,5);assert.equal(context.term,'歌う');assert.equal(context.sentence,'私は戀人と歌う。');assert.deepEqual(context.segments,snapshot.segments);
assert.equal(capture.fromSelection(choose(start,0,doc.querySelector('.rnp-lyrics-line-original').firstChild,1),doc),null);
const config={dictionaryEnabled:false},subscribers=new Set(),sent=[];
const api={config:()=>config,set:(key,value)=>{config[key]=value;for(const f of subscribers)f();},subscribe:f=>{subscribers.add(f);return()=>subscribers.delete(f);},track:()=>({id:'42',title:'試験曲'}),transport:{send:async(action,ctx)=>sent.push({action,...ctx})}};
const adapter=install(api,doc);const tick=()=>new Promise(r=>setTimeout(r,20));
function event(type,x,shiftKey=true){song.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:1,clientX:x,clientY:10,shiftKey}));}
// Model the desktop client's disabled native selection: it supplies caret geometry,
// while selectstart is cancelled. A programmatic drag range must still work.
doc.addEventListener('selectstart',e=>e.preventDefault());
doc.caretRangeFromPoint=x=>{const r=doc.createRange();r.setStart(x<5?start:end,x<5?0:1);r.collapse(true);return r;};
(async()=>{
 event('mousedown',0);event('mousemove',10);event('mouseup',10);await tick();assert.equal(sent.length,0);
 api.set('dictionaryEnabled',true);let seeks=0;doc.addEventListener('click',()=>seeks++);
 event('mousedown',0);event('mousemove',10);event('mouseup',10);event('click',10,false);await tick();
 assert.equal(sent.length,1);assert.equal(sent[0].term,'歌う');assert.equal(sent[0].offset,5);assert.deepEqual(sent[0].segments,snapshot.segments);assert.equal(seeks,0);
 // Reverse drag yields the same textual occurrence.
 event('mousedown',10);event('mousemove',0);event('mouseup',0);await tick();assert.equal(sent[1].term,'歌う');
 api.set('dictionaryEnabled',false);await tick();assert.equal(sent.at(-1).action,'shutdown');
 adapter.destroy();dom.window.close();console.log('Selection passed: current custom reading snapshot, ruby/filler/hidden filtering, offsets, blocked-native and reverse drag, seek prevention, enable/disable.');
})().catch(e=>{console.error(e);process.exitCode=1;adapter.destroy();dom.window.close();});
