import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main,scoreRows} from '../../../scripts/review-comparison.mjs';
import {trace} from '../test/comparison-fixture.js';
it('prepares and locks blind reviews without revealing algorithm output',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'atm-review-'));const out=join(dir,'review');
 try {
  for(const side of ['good','bad'])writeFileSync(join(dir,side+'.json'),JSON.stringify(trace([{name:'read'}],side)));
  await main(['prepare','--out',out,'--good',join(dir,'good.json'),'--bad',join(dir,'bad.json'),'--provenance','synthetic_structural','--provider','codex']);
  expect(existsSync(join(out,'actual.json'))).toBe(false);
  await expect(main(['lock','--out',out])).rejects.toThrow(/Complete reviewer/);
  const expected={reviewer:'SYNTHETIC TEST',reviewedBeforeAlgorithm:true,rows:[{goodOrdinal:0,badOrdinal:0,classification:'matched'},{goodOrdinal:1,badOrdinal:1,classification:'matched'}],firstDivergence:null,rationale:'Synthetic structure only'};
  writeFileSync(join(out,'expected.json'),JSON.stringify(expected));await main(['lock','--out',out]);
  await expect(main(['lock','--out',out])).rejects.toThrow();expect(existsSync(join(out,'actual.json'))).toBe(false);
  expect(JSON.parse(readFileSync(join(out,'manifest.json'),'utf8')).realPairGate).toBe('pending');
  writeFileSync(join(out,'good.json'),'[]');await expect(main(['lock','--out',out])).rejects.toThrow(/hashes changed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('scores alignment and classes separately with explicit denominators',()=>{
 const expected=[{goodOrdinal:1,badOrdinal:1,classification:'changed'},{goodOrdinal:2,classification:'missing'}];
 const actual=[{goodOrdinal:1,badOrdinal:1,classification:'matched'},{badOrdinal:2,classification:'inserted'}];
 expect(scoreRows(expected,actual)).toMatchObject({alignedRows:1,correctClasses:0,alignmentPrecision:.5,alignmentRecall:.5,classAgreement:0});
 expect(scoreRows([],[]).alignmentPrecision).toBeNull();
});
