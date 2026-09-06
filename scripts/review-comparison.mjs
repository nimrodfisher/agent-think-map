import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const write=(dir,name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const events=value=>{const rows=Array.isArray(value)?value:value.items;if(!Array.isArray(rows))throw Error('Expected a local trace JSON array or {items: envelopes}');return rows.map(row=>row.payload??row);};
const key=row=>JSON.stringify([row.goodOrdinal??null,row.badOrdinal??null]);
export function scoreRows(expected,actual){
 const expectedMap=new Map(expected.map(row=>[key(row),row.classification]));
 const actualMap=new Map(actual.map(row=>[key(row),row.classification]));
 const aligned=[...actualMap.keys()].filter(key=>expectedMap.has(key));
 return {expectedRows:expectedMap.size,actualRows:actualMap.size,alignedRows:aligned.length,correctClasses:aligned.filter(key=>expectedMap.get(key)===actualMap.get(key)).length,alignmentPrecision:actualMap.size?aligned.length/actualMap.size:null,alignmentRecall:expectedMap.size?aligned.length/expectedMap.size:null,classAgreement:aligned.length?aligned.filter(key=>expectedMap.get(key)===actualMap.get(key)).length/aligned.length:null};
}
export async function main(args){
 const [command,...rest]=args;const options={};for(let i=0;i<rest.length;i+=2){if(!rest[i].startsWith('--')||rest[i+1]===undefined)throw Error('Use --key value arguments');options[rest[i].slice(2)]=rest[i+1];}
 if(!options.out)throw Error('Supply --out local-review-directory');const dir=resolve(options.out);
 if(command==='prepare'){
  if(!['real_developer_pair','synthetic_structural'].includes(options.provenance))throw Error('Declare --provenance real_developer_pair or synthetic_structural');
  if(!['claude-code','codex','mixed'].includes(options.provider))throw Error('Declare --provider claude-code, codex or mixed');
  const good=events(json(resolve(options.good))),bad=events(json(resolve(options.bad)));
  const manifest={schemaVersion:1,provenance:options.provenance,provider:options.provider,preparedAt:new Date().toISOString(),goodHash:hash(good),badHash:hash(bad),realPairGate:'pending'};
  mkdirSync(dir,{recursive:true});if(existsSync(join(dir,'manifest.json')))throw Error('Review directory already prepared');
  write(dir,'manifest.json',manifest);write(dir,'good.json',good);write(dir,'bad.json',bad);
  write(dir,'expected.json',{reviewer:null,reviewedBeforeAlgorithm:false,rows:[],firstDivergence:'unknown',rationale:'',uncertainties:[]});
  console.log('Prepared blind local review. Read good.json and bad.json; fill expected.json, then lock. Algorithm output has not been generated.');return;
 }
 const manifest=json(join(dir,'manifest.json')),good=json(join(dir,'good.json')),bad=json(join(dir,'bad.json'));
 if(hash(good)!==manifest.goodHash||hash(bad)!==manifest.badHash)throw Error('Trace hashes changed; prepare a new review');
 if(command==='lock'){
  const expected=json(join(dir,'expected.json'));
  if(typeof expected.reviewer!=='string'||!expected.reviewer.trim()||expected.reviewedBeforeAlgorithm!==true||!Array.isArray(expected.rows)||!expected.rows.length||!expected.rationale)throw Error('Complete reviewer, blind-review declaration, rows and rationale first');
  const classes=['matched','inserted','missing','changed','reordered'];
  for(const row of expected.rows)if(!classes.includes(row.classification)||![row.goodOrdinal,row.badOrdinal].some(Number.isSafeInteger)||[row.goodOrdinal,row.badOrdinal].some(n=>n!==undefined&&(!Number.isSafeInteger(n)||n<0)))throw Error('Each expected row needs a valid class and zero-based good/bad ordinal');
  if(new Set(expected.rows.map(key)).size!==expected.rows.length)throw Error('Duplicate expected row');
  write(dir,'expected.locked.json',{...expected,lockedAt:new Date().toISOString(),traceHashes:[manifest.goodHash,manifest.badHash]});
  console.log('Blind expectations locked without generating algorithm output.');return;
 }
 const expected=json(join(dir,'expected.locked.json'));
 if(command==='reveal'){
  const {compareRuns}=await import('../dist/lib/storage.js');
  const actual=compareRuns('bad','good',bad,good);write(dir,'actual.json',actual);
  write(dir,'assessment.json',{useful:'unknown',falseAlignmentClasses:[],notes:'',adjudication:'pending'});
  console.log('Algorithm result revealed. Record usefulness and false-alignment classes in assessment.json; preserve the blind expectation.');return;
 }
 if(command==='score'){
  const actual=json(join(dir,'actual.json')),assessment=json(join(dir,'assessment.json'));
  if(!['yes','no','unknown'].includes(assessment.useful))throw Error('Usefulness must be yes, no or unknown');
  const first=actual.firstDivergence===undefined?null:actual.rows[actual.firstDivergence];
  const firstAgreement=expected.firstDivergence==='unknown'?null:expected.firstDivergence===null?first===null:first!==null&&key(expected.firstDivergence)===key(first);
  const result={provenance:manifest.provenance,provider:manifest.provider,reviewer:expected.reviewer,analyzerVersion:actual.analyzerVersion,fingerprintVersion:actual.fingerprintVersion,...scoreRows(expected.rows,actual.rows),firstDivergenceAgreement:firstAgreement,useful:assessment.useful,falseAlignmentClasses:assessment.falseAlignmentClasses,realPairGate:'pending',note:'Per-pair scores do not grant release approval. Aggregate real pairs separately and require explicit human adjudication.'};
  console.log(JSON.stringify(result,null,2));return;
 }
 throw Error('Commands: prepare, lock, reveal, score');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
