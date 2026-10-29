'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),adapter=require('../companion/yomitan/anki-context.js'),capture=require('../src/selection.js');
const dom=new JSDOM('<div class="rnp-lyrics-line"><div class="rnp-lyrics-line-original">風が歌う</div><div class="rnp-lyrics-line-romaji">kaze ga utau</div><div class="rnp-lyrics-line-translated">风在歌唱</div></div><div class="rnp-lyrics-line"><div class="rnp-lyrics-line-original">風が歌う</div></div><div class="rnp-lyrics-overview-line"><div class="rnp-lyrics-overview-line-original">光る</div><div class="rnp-lyrics-overview-line-translation">闪耀</div></div>');
const doc=dom.window.document,lines=doc.querySelectorAll('.rnp-lyrics-line-original'),take=line=>capture.fromOffsets(doc,line,0,1);
const first=take(lines[0]);assert.equal(first.translation,'风在歌唱');assert.equal(take(lines[1]).translation,'','No neighbouring translation for a repeated line');
assert.equal(take(doc.querySelector('.rnp-lyrics-overview-line-original')).translation,'闪耀');
lines[1].__reactFiber$test={memoizedProps:{line:{originalLyric:'風が歌う',translatedLyric:'隐藏的译文'}}};assert.equal(take(lines[1]).translation,'隐藏的译文');
lines[1].__reactFiber$test.memoizedProps.line.originalLyric='別の行';assert.equal(take(lines[1]).translation,'');
doc.querySelector('.rnp-lyrics-line-translated').textContent='后来的译文';assert.equal(first.translation,'风在歌唱','Selection owns its translation snapshot');
class Builder{_renderTemplateBatched(_t,_d,m){return Promise.resolve({result:'upstream:'+m,requirements:[]});}}
class DisplayAnki{constructor(value){this._display={history:{state:value}};}_getNoteContext(){const s=this._display.history.state;return {sentence:s.sentence,url:s.url};}}
adapter.install(Builder,DisplayAnki);
const lyric={sentence:'戀人と歌う',translation:'与你歌唱 <script>x</script>\n第二行',url:'https://music.163.com/song?id=42',songTitle:'歌 <一>',songArtist:'甲 & 乙',segments:[{text:'戀人',reading:'あなた'},{text:'と歌う',reading:''}]};
const state={sentence:{text:lyric.sentence,offset:3},url:lyric.url,ncmLyrics:lyric};
const controller=new DisplayAnki(state),context=controller._getNoteContext(),builder=new Builder();
lyric.translation='changed';lyric.songTitle='changed';lyric.segments[0].reading='changed';
(async()=>{
 const render=(m,c=context)=>builder._renderTemplateBatched('',{context:c},m).then(r=>r.result);
 assert.equal(await render('ncm-sentence-translation'),'与你歌唱 &lt;script&gt;x&lt;/script&gt;<br>第二行');
 assert.equal(await render('ncm-song-title'),'歌 &lt;一&gt;');assert.equal(await render('ncm-song-artist'),'甲 &amp; 乙');assert.equal(await render('ncm-song-url'),lyric.url);
 assert.equal(await render('sentence'),'<ruby>戀人<rt>あなた</rt></ruby>と歌う');assert.equal(await render('sentence-furigana-plain'),'戀人[あなた]と歌う');
 assert.equal(await render('glossary'),'upstream:glossary');
 controller._display.history.state={sentence:{text:'辞書の例',offset:0},url:lyric.url,ncmLyrics:lyric};const unrelated=controller._getNoteContext();assert.equal(await render('ncm-sentence-translation',unrelated),'');assert.equal(await render('sentence',unrelated),'upstream:sentence');
 const empty={...context,ncmLyrics:{...context.ncmLyrics,translation:''}};assert.equal(await render('ncm-sentence-translation',empty),'');
 class Menus{constructor(){this.items={};this._settingsController={templates:{getTemplateContent:name=>this.items[name]||(this.items[name]=JSDOM.fragment('<div class="popup-menu-body"></div>'))}};}async _setupFieldMenus(){}}
 adapter.installMenus(Menus);const menus=new Menus();await menus._setupFieldMenus();await menus._setupFieldMenus();assert.equal(menus.items['anki-card-term-field-menu'].querySelectorAll('button').length,4);
 dom.window.close();console.log('Anki context passed: row-local/hidden translations, history snapshots, escaped markers, absent translations, current readings, idempotent settings menus.');
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close();});
