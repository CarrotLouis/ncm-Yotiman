/* Visible lyric text and reading snapshots, independent of the furigana renderer. MIT. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NcmYotimanSelection=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const LINES='.rnp-lyrics-line-original,.rnp-lyrics-line-karaoke,.lyric-line,.lyric-next-p,ul.lyric li p';
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
 function validLine(node){const el=element(node),line=el&&el.closest(LINES);if(!line||excluded(node))return null;if(line.matches('ul.lyric li p')&&line.parentElement.querySelector('p')!==line)return null;return line;}
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
  if(doc.caretPositionFromPoint){const p=doc.caretPositionFromPoint(x,y);if(p)return {node:p.offsetNode,offset:p.offset};}
  if(doc.caretRangeFromPoint){const r=doc.caretRangeFromPoint(x,y);if(r)return {node:r.startContainer,offset:r.startOffset};}
  return null;
 }
 function begin(doc,event){const point=caret(doc,event.clientX,event.clientY),line=point&&validLine(point.node);return line?{...point,line}:null;}
 function extend(doc,anchor,event){
  if(!anchor||!anchor.node.isConnected)return false;
  const point=caret(doc,event.clientX,event.clientY);if(!point||!anchor.line.contains(point.node)||excluded(point.node))return false;
  const left=doc.createRange(),right=doc.createRange();left.setStart(anchor.node,anchor.offset);left.collapse(true);right.setStart(point.node,point.offset);right.collapse(true);
  const range=doc.createRange();if(left.compareBoundaryPoints(0,right)<=0){range.setStart(anchor.node,anchor.offset);range.setEnd(point.node,point.offset);}else{range.setStart(point.node,point.offset);range.setEnd(anchor.node,anchor.offset);}
  const selection=doc.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);return true;
 }
 return {LINES,EXCLUDE,plain,snapshot,fromSelection,begin,extend};
});
