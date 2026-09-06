import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,SCHEMA_V1} from './sqlite-run-store.js';
import {trace} from '../test/comparison-fixture.js';
it('migrates populated V1, caches derived rows, rebuilds versions, invalidates appends/labels and cascades deletion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'atm-diff-'));const path=join(dir,'runs.db');
 const old=new DatabaseSync(path);old.exec(SCHEMA_V1);old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL); INSERT INTO schema_migrations VALUES(1,1)');old.close();
 let store=new SqliteRunStore({path});let db:DatabaseSync|undefined;
 try {
  for(const id of ['bad','good'])for(const [i,payload] of trace([{name:'read',input:{path:id==='bad'?'a.py':'b.ts'}}],id).entries())await store.append({schemaVersion:1,eventId:id+i,sessionId:id,provider:'codex',timestamp:payload.ts,payload});
  const first=(await store.compareRuns('bad','good'))!;expect(first.badRunId).toBe('bad');expect(first.warnings.join(' ')).toContain('not explicitly labeled');
  expect(await store.compareRuns('bad','good')).toEqual(first);await store.close();store=new SqliteRunStore({path});expect(await store.getDiff(first.diffId)).toEqual(first);
  db=new DatabaseSync(path);expect(db.prepare('SELECT count(*) n FROM run_steps').get()?.n).toBe(4);
  const v2=(await store.compareRuns('bad','good',2))!;expect(v2.analyzerVersion).toBe(2);expect(v2.diffId).not.toBe(first.diffId);expect(db.prepare('SELECT DISTINCT analyzer_version FROM run_steps').all()).toEqual([{analyzer_version:2}]);
  expect(await store.getDiff(first.diffId,2)).toBeUndefined();
  await store.setOutcome('bad','failed');await store.setOutcome('good','worked');const labeled=(await store.compareRuns('bad','good'))!;expect(labeled.warnings.join(' ')).not.toContain('not explicitly labeled');
  await store.append({schemaVersion:1,eventId:'new',sessionId:'bad',provider:'codex',timestamp:200,payload:{type:'run.meta',runId:'bad',model:'new',ts:200}});
  expect(await store.getDiff(labeled.diffId)).toBeUndefined();expect(db.prepare('SELECT count(*) n FROM run_steps WHERE run_id=?').get('bad')?.n).toBe(0);
  await store.compareRuns('bad','good');await store.deleteRun('good');expect(db.prepare('SELECT count(*) n FROM run_diffs').get()?.n).toBe(0);expect(await store.compareRuns('bad','good')).toBeUndefined();
 } finally {db?.close();await store.close();rmSync(dir,{recursive:true,force:true});}
});
