'use strict';
const assert=require('node:assert/strict'),{longest}=require('../companion/yomitan/range-match.js');
const entry=text=>({headwords:[{sources:[{originalText:text}]}]});
(async()=>{
 let calls=[];const find=async text=>{calls.push(text);return {dictionaryEntries:['成り果てる','果てる','成','り','魔物'].filter(word=>text.startsWith(word)).map(entry)};};
 let result=await longest('成り果てる',find);assert.equal(result.text,'成り果てる');assert.equal(result.offset,0);assert.equal(result.dictionaryEntries.length,1);assert.equal(calls.length,1,'Full match needs one Yomitan prefix/deinflection lookup');
 calls=[];result=await longest('に成り果てるだ',find);assert.equal(result.text,'成り果てる');assert.equal(result.offset,1);assert.equal(calls.length,2,'Prune suffixes unable to beat the best');assert(calls.every(q=>'に成り果てるだ'.endsWith(q)));
 result=await longest('魔物に成り果てる',find);assert.equal(result.text,'成り果てる','Longest match wins over an earlier shorter word');
 result=await longest('魔物と魔物',find);assert.equal(result.offset,0,'Equal lengths prefer the first occurrence');
 result=await longest('成り',find);assert.equal(result.text,'成','Do not append characters from the rest of the lyric');
 result=await longest('😀成り果てる',find);assert.equal(result.offset,2,'Offsets retain UTF-16 DOM units');
 result=await longest('あああ',find);assert.equal(result.length,0);assert.deepEqual(result.dictionaryEntries,[]);
 await assert.rejects(longest('あ'.repeat(121),find));await assert.rejects(longest('成',async()=>{throw new Error('offline');}),/offline/);
 console.log('Range matching passed: full/inner longest match, inflection source length, earliest tie, strict bounds, pruning, Unicode and errors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
