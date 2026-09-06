import { describe, expect, it } from 'vitest';
import { SqliteRunStore } from './sqlite-run-store.js';
import { groupProblems } from './problems.js';
import type { AgentTraceEvent } from '../../protocol/src/index.js';

describe('recorded problem discovery',() => {
  it('counts distinct runs separately from occurrences and separates unknown operations and different errors',() => {
    const base = {runId:'a',title:'Task',provider:'codex',timestamp:1,sequence:2,message:'Permission denied',operation:'read'};
    const result = groupProblems([base,{...base,sequence:3},{...base,runId:'b'},{...base,message:'Timeout'},{...base,operation:undefined},{...base,operation:undefined,runId:'b'}]);
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({count:3,runCount:2,operation:'read'});
  });
  it('finds failures outside the history page, isolates repeated IDs across turns, and follows deletion',async() => {
    const store = new SqliteRunStore({path:':memory:'});
    try {
      for (let i=0;i<25;i++) {
        const id = 'run-' + i;
        const events: AgentTraceEvent[] = [
          {type:'run.started',runId:id,prompt:id,ts:i},
          {type:'node.started',id:'tool',kind:'tool',title:'Read file',operation:{name:'read'},ts:i},
          {type:'node.failed',id:'tool',error:'Permission denied',ts:i},
        ];
        await store.appendBatch(events.map((payload,n) => ({schemaVersion:1,provider:i%2 ? 'codex' : 'claude-code',sessionId:id,eventId:id+'-'+n,timestamp:i,payload})));
      }
      expect((await store.listRuns({limit:20})).items).toHaveLength(20);
      expect((await store.listProblems()).items[0]).toMatchObject({runCount:25,count:25,operation:'read'});
      expect((await store.listProblems()).items[0].occurrences).toHaveLength(20);
      await store.appendBatch([
        {schemaVersion:1,provider:'claude-code',sessionId:'run-0',eventId:'next-turn',timestamp:30,payload:{type:'run.started',runId:'run-0',prompt:'New turn',ts:30}},
        {schemaVersion:1,provider:'claude-code',sessionId:'run-0',eventId:'orphan',timestamp:31,payload:{type:'node.failed',id:'tool',error:'Permission denied',ts:31}},
      ]);
      expect((await store.listProblems()).items).toHaveLength(2);
      await store.deleteRun('run-0');
      expect((await store.listProblems()).items).toHaveLength(1);
      expect((await store.listProblems()).items[0].runCount).toBe(24);
    } finally { await store.close(); }
  });
});
