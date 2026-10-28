'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const capture=require('../src/selection.js'),{install}=require('../src/dictionary.js');
const dom=new JSDOM('<body><div class="rnp-lyrics-line-original">やがては同じ魔物に<span class="fg-ruby"><ruby>成<rt>な</rt></ruby></span>り<span class="fg-ruby"><ruby>果てる<rt>はてる</rt></ruby></span>だ</div><div class="rnp-lyrics-line-translated">译文</div></body>',{pretendToBeVisual:true});
const win=dom.window,doc=win.document,line=doc.querySelector('.rnp-lyrics-line-original'),sentence=capture.snapshot(line).sentence,nodes=new Map();
const walker=doc.createTreeWalker(line,4);let node,at=0;while((node=walker.nextNode())){if(node.parentElement.closest('rt'))continue;nodes.set(node,at*20);at+=node.length;}
win.Range.prototype.getClientRects=function(){const left=nodes.get(this.startContainer);if(left===undefined||this.startContainer!==this.endContainer)return [];const x=left+this.startOffset*20,width=(this.endOffset-this.startOffset)*20;return [{left:x,right:x+width,top:10,bottom:50,width,height:40}];};
doc.caretRangeFromPoint=x=>{for(const [node,left]of nodes)if(x>=left&&x<left+node.length*20){const r=doc.createRange();r.setStart(node,Math.max(0,Math.min(node.length,Math.round((x-left)/20))));r.collapse(true);return r;}return null;};
const start=sentence.indexOf('成'),end=sentence.indexOf('だ')-1,point=offset=>({target:line,clientX:offset*20+18,clientY:30});
assert.equal(capture.fromPoint(doc,point(start)).term,'成','Point hits one glyph, without ruby or tokenizer boundaries');
assert.equal(capture.fromPoint(doc,point(end)).term,'る');
assert.equal(capture.fromPoint(doc,point(100)),null);
const nativeCaret=doc.caretRangeFromPoint;doc.caretRangeFromPoint=()=>null;assert.equal(capture.fromPoint(doc,point(start)).offset,start);doc.caretRangeFromPoint=nativeCaret;
const sent=[],config={dictionaryEnabled:true,dictionaryInputMode:'hover'};let changed,reply;
const adapter=install({config:()=>config,subscribe:fn=>{changed=fn;return()=>{};},set(){},track:()=>({id:'42'}),transport:{send:async(action,context)=>{if(action==='lookup'){sent.push(context);return typeof reply==='function'?reply(context):reply;}}}},doc);
const tick=(ms=35)=>new Promise(r=>setTimeout(r,ms));
function move(offset,buttons=0,type='mousemove'){line.dispatchEvent(new win.MouseEvent(type,{bubbles:true,...point(offset),buttons,shiftKey:true}));}
function key(type){win.dispatchEvent(new win.KeyboardEvent(type,{key:'Shift',shiftKey:type==='keydown'}));}
function selected(){return win.getSelection().rangeCount?capture.plain(win.getSelection().getRangeAt(0).cloneContents()):'';}
(async()=>{
 move(start);await tick();assert.equal(sent.length,0);
 key('keydown');move(end);await tick(180);assert.equal(sent.length,0,'Holding Shift must never query before confirmation');assert.equal(selected(),'成り果てる','Selection crosses ruby 成, plain り and ruby 果てる');
 key('keyup');await tick();assert.equal(sent.length,1);assert.equal(sent[0].term,'成り果てる');assert.equal(sent[0].offset,start);assert.equal(sent[0].matchMode,'longest-in-range');assert(!JSON.stringify(sent).includes('"range":'));assert.equal(adapter.diagnostics().down,0);
 move(end);key('keydown');move(start);key('keyup');await tick();assert.equal(sent.length,2);assert.equal(sent[1].term,'成り果てる','Reverse movement flushes the final frame on Shift release');
 move(start);key('keydown');move(end);win.dispatchEvent(new win.Event('blur'));key('keyup');await tick();assert.equal(sent.length,2,'Focus loss cancels unconfirmed range');
 move(start);key('keydown');move(end);config.dictionaryInputMode='drag';changed();key('keyup');await tick();assert.equal(sent.length,2,'Changing mode cancels selection');
 move(start);key('keydown');move(end);key('keyup');await tick();assert.equal(sent.length,2,'Drag mode ignores Shift-only movement');
 config.dictionaryInputMode='hover';changed();
 reply={match:{offset:start,length:5,text:'成り果てる'}};move(start-1);key('keydown');move(end+1);key('keyup');await tick();assert.equal(sent.at(-1).term,'に成り果てるだ');assert.equal(selected(),'成り果てる','Highlight narrows to actual dictionary match inside the submitted range');
 reply={match:{offset:0,length:sentence.length,text:sentence}};move(start);key('keydown');move(start+1);key('keyup');await tick();assert.equal(selected(),'成り','Malformed reply cannot expand the selected range');
 let resolve;const before=sent.length;reply=()=>new Promise(r=>resolve=r);move(start);key('keydown');key('keyup');await tick();move(end);key('keydown');key('keyup');await tick();reply=undefined;resolve({match:{offset:start,length:1,text:'成'}});await tick();assert.equal(selected(),'る','Late result cannot overwrite a new range');assert.equal(sent.length,before+2,'A confirmed range is queued while the previous lookup is pending');assert.equal(sent.at(-1).term,'る');win.dispatchEvent(new win.Event('blur'));
 move(start);key('keydown');move(end);config.dictionaryEnabled=false;adapter.setEnabled(false);key('keyup');await tick();const count=sent.length;config.dictionaryEnabled=true;adapter.setEnabled(true);key('keyup');await tick();assert.equal(sent.length,count,'Disabled gesture cannot resume after enabling');
 adapter.destroy();win.close();console.log('Shift range passed: continuous ruby/plain selection, release confirmation, reverse movement, cancellation, bounded match highlight and stale replies.');
})().catch(e=>{console.error(e);process.exitCode=1;adapter.destroy();win.close();});
