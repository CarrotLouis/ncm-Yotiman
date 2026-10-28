// Local integration sink, separate port/profile; never touches real Anki.
'use strict';
const http=require('node:http'),fs=require('node:fs');
const output=process.argv[2]; if(!output) throw new Error('Pass a private output path');
function result(q) {
 switch(q.action) {
 case 'version':return 6;
 case 'apiReflect':return {scopes:['actions'],actions:['version','addNote','storeMediaFile','canAddNotes','canAddNotesWithErrorDetail','findNotes','notesInfo','cardsInfo','deckNames','modelNames','modelFieldNames']};
 case 'deckNames':case 'modelNames':return ['Smoke'];
 case 'modelFieldNames':return ['Expression','Sentence','SentenceRuby','SentencePlain','SentenceAudio','Source'];
 case 'canAddNotes':return q.params.notes.map(()=>true);
 case 'canAddNotesWithErrorDetail':return q.params.notes.map(()=>({canAdd:true}));
 case 'findNotes':case 'findCards':case 'notesInfo':case 'cardsInfo':return [];
 case 'storeMediaFile':return q.params.filename;
 case 'addNote':return 424242;
 case 'multi':return q.params.actions.map(a=>({result:result(a),error:null}));
 default:return null;
 }
}
http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS')return res.end();
 let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
  try {const q=JSON.parse(raw);fs.appendFileSync(output,JSON.stringify(q)+'\n');res.end(JSON.stringify(q.version<=4?result(q):{result:result(q),error:null}));}
  catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
 });
}).listen(18766,'127.0.0.1',()=>process.stdout.write('Mock Anki listening on 18766\n'));
