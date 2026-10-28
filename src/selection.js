/* Visible lyric text and reading snapshots, independent of the furigana renderer. MIT. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NcmYotimanSelection=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const LINES='.rnp-lyrics-line-original,.rnp-lyrics-line-karaoke,.rnp-lyrics-overview-line-original,.lyric-line,.lyric-next-p,ul.lyric li p,[class^="lyricMainLine"],[class*=" lyricMainLine"],[data-ncm-yotiman-line]';
 const EXCLUDE='rt,rp,.fg-rt,.fg-hide,.rnp-karaoke-word-filler,.fg-edit-ui,.ncm-yotiman-ui';
 const element=node=>node&&node.nodeType===1?node:node&&node.parentElement;
 const excluded=node=>element(node)&&element(node).closest(EXCLUDE);
 function plain(node){const copy=node.cloneNode(true);if(copy.nodeType===1&&copy.matches(EXCLUDE))return '';for(const el of copy.querySelectorAll?copy.querySelectorAll(EXCLUDE):[])el.remove();return copy.textContent||'';}
 function snapshot(line){
  const segments=[];
  function add(text,reading=''){if(!text)return;const last=segments[segments.length-1];if(last&&!last.reading&&!reading)last.text+=text;else segments.push({text,reading});}
  function visit(node){
   if(node.nodeType===3){add(node.nodeValue);return;}
   if(node.nodeType!==1||node.matches(EXCLUDE))return;
   if(node.matches('.fg-ruby,ruby')){
    const current=node.querySelector('.fg-reading');const rt=node.querySelector('.fg-rt,rt');
    let reading=current?current.textContent:'';
    if(!current&&rt){const copy=rt.cloneNode(true);for(const old of copy.querySelectorAll('del,.fg-edit-original'))old.remove();reading=copy.textContent;}
    add(plain(node),reading.slice(0,100));return;
   }
   for(const child of node.childNodes)visit(child);
  }
  for(const child of line.childNodes)visit(child);
  return {sentence:segments.map(s=>s.text).join(''),segments};
 }
 function validLine(node){
  const el=element(node);if(!el||excluded(node))return null;
  let line=null;
  for(let parent=el;parent&&parent!==el.ownerDocument.body;parent=parent.parentElement){
   if(typeof parent.__fgText==='string'&&Array.isArray(parent.__fgHosts)){line=parent;break;}
   if(parent.matches(LINES)){line=parent;break;}
  }
  if(!line)return null;if(line.matches('ul.lyric li p')&&line.parentElement.querySelector('p')!==line)return null;return line;
 }
 function lineForTarget(node){
  const direct=validLine(node);if(direct)return direct;
  const el=element(node),row=el&&el.closest('.rnp-lyrics-line,li.line');
  return row&&row.querySelector('.rnp-lyrics-line-karaoke,.rnp-lyrics-line-original,p:first-child');
 }
 function mark(line){if(line&&!line.hasAttribute('data-ncm-yotiman-line'))line.setAttribute('data-ncm-yotiman-line','');return line;}
 function lines(doc){const result=new Set(doc.querySelectorAll(LINES));for(const wrapper of doc.querySelectorAll('.fg-line')){const line=validLine(wrapper);if(line)result.add(mark(line));}return [...result];}
 function fromSelection(selection,doc){
  if(!selection||selection.isCollapsed||selection.rangeCount!==1)return null;
  const range=selection.getRangeAt(0),line=validLine(range.startContainer);
  if(!line||!line.contains(range.endContainer)||excluded(range.endContainer))return null;
  const prefix=doc.createRange();prefix.selectNodeContents(line);prefix.setEnd(range.startContainer,range.startOffset);
  const raw=plain(range.cloneContents()),term=raw.trim(),data=snapshot(line);
  const offset=plain(prefix.cloneContents()).length+raw.length-raw.trimStart().length;
  if(!term||term.length>120||data.sentence.length>4000||!/[\u3040-\u30ff\u3400-\u9fff]/.test(term)||data.sentence.slice(offset,offset+term.length)!==term)return null;
  return {term,...data,offset};
 }
 function caret(doc,x,y){
  try{if(doc.caretPositionFromPoint){const p=doc.caretPositionFromPoint(x,y);if(p)return {node:p.offsetNode,offset:p.offset};}}catch(_){ }
  try{if(doc.caretRangeFromPoint){const r=doc.caretRangeFromPoint(x,y);if(r)return {node:r.startContainer,offset:r.startOffset};}}catch(_){ }
  return null;
 }
 function glyphs(doc,line){
  const result=[],walker=doc.createTreeWalker(line,4);let node,characters=0;
  while((node=walker.nextNode())){
   if(excluded(node))continue;
   for(let at=0;at<node.length;){if(characters++>=4000)return result;const length=node.nodeValue.codePointAt(at)>0xffff?2:1,range=doc.createRange();range.setStart(node,at);range.setEnd(node,at+length);
    for(const rect of range.getClientRects())if(rect.width>0&&rect.height>0)result.push({node,offset:at,end:at+length,rect});at+=length;
   }
  }return result;
 }
 function geometricPoint(measured,x,y){
  let best=null,distance=Infinity;
  for(const glyph of measured){const r=glyph.rect,dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom),score=dx*dx+dy*dy*4;if(score<distance){distance=score;best=glyph;}}
  return best?{node:best.node,offset:x<(best.rect.left+best.rect.right)/2?best.offset:best.end}:null;
 }
 function fromPoint(doc,event){
  const line=lineForTarget(event.target);if(!line)return null;
  const x=event.clientX,y=event.clientY,hit=r=>r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
  let glyph=null;const point=caret(doc,x,y);
  if(point&&point.node.nodeType===3&&line.contains(point.node)&&!excluded(point.node)){
   const text=point.node.nodeValue,previous=point.offset>1&&/[\uDC00-\uDFFF]/.test(text[point.offset-1])?point.offset-2:point.offset-1;
   // A caret is a boundary: on the right half of a glyph it points to the next
   // character. Inspect both sides so hovering never skips that character.
   for(const at of [point.offset,previous])if(at>=0&&at<text.length){
    const range=doc.createRange();range.setStart(point.node,at);range.setEnd(point.node,at+(text.codePointAt(at)>0xffff?2:1));
    if([...range.getClientRects()].some(hit)){glyph={node:point.node,offset:at};break;}
   }
  }
  if(!glyph)glyph=glyphs(doc,line).find(g=>hit(g.rect));
  if(!glyph)return null;
  const prefix=doc.createRange();prefix.selectNodeContents(line);prefix.setEnd(glyph.node,glyph.offset);
  const offset=plain(prefix.cloneContents()).length,data=snapshot(line);
  if(data.sentence.length>4000)return null;
  let term=data.sentence.slice(offset,offset+32).trimEnd();
  if(/[\uD800-\uDBFF]$/.test(term))term=term.slice(0,-1);
  if(!/^[\u3040-\u30ff\u3400-\u9fff]/.test(term))return null;
  return {term,...data,offset};
 }
 function begin(doc,event,preferredLine){
  const line=mark(preferredLine||lineForTarget(event.target)),point=caret(doc,event.clientX,event.clientY);
  if(point&&point.node.nodeType===3&&line&&line.contains(point.node)&&!excluded(point.node))return {...point,line,measured:null};
  if(!line)return null;const measured=glyphs(doc,line),fallback=geometricPoint(measured,event.clientX,event.clientY);return fallback?{...fallback,line,measured}:null;
 }
 function extend(doc,anchor,event){
  if(!anchor||!anchor.node.isConnected)return false;
  let point=caret(doc,event.clientX,event.clientY);
  if(!point||point.node.nodeType!==3||!anchor.line.contains(point.node)||excluded(point.node)){if(!anchor.measured)anchor.measured=glyphs(doc,anchor.line);point=geometricPoint(anchor.measured,event.clientX,event.clientY);}
  if(!point)return false;
  const left=doc.createRange(),right=doc.createRange();left.setStart(anchor.node,anchor.offset);left.collapse(true);right.setStart(point.node,point.offset);right.collapse(true);
  const range=doc.createRange();if(left.compareBoundaryPoints(0,right)<=0){range.setStart(anchor.node,anchor.offset);range.setEnd(point.node,point.offset);}else{range.setStart(point.node,point.offset);range.setEnd(anchor.node,anchor.offset);}
  const selection=doc.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);return true;
 }
 return {LINES,EXCLUDE,plain,snapshot,fromSelection,fromPoint,lineForTarget,lines,mark,begin,extend};
});
