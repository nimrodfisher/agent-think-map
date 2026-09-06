import {it,expect} from 'vitest';
import {get,type Server} from 'node:http';
import {createCodexStudio} from '../codex/src/studio.js';
import {createClaudeCodeStudio} from '../claude-code/src/studio.js';
import {CodexTraceHub} from '../codex/src/hub.js';
import {ClaudeCodeTraceHub} from '../claude-code/src/hub.js';
import {SqliteRunStore} from '../../core/src/sqlite-run-store.js';
import {trace} from '../../core/test/comparison-fixture.js';
for(const [Hub,create] of [[CodexTraceHub,createCodexStudio],[ClaudeCodeTraceHub,createClaudeCodeStudio]] as const)it(Hub.name+' diff API validates sides, persists results and rejects foreign Host/Origin',async()=>{
 const store=new SqliteRunStore({path:':memory:'});const hub=new Hub({store,recover:false});
 for(const id of ['bad','good'])for(const payload of trace([{name:'read'}],id))await hub.append(payload,id);
 const server=create({hub:hub as any,root:process.cwd()});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const post=(body:unknown,headers:Record<string,string>={})=>fetch(base+'/api/diffs',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...headers},body:JSON.stringify(body)});
 try {
  const stale=(await store.compareRuns('bad','good',1))!;
  expect((await fetch(base+'/api/diffs/'+stale.diffId)).status).toBe(404);
  const pair={badRunId:'bad',goodRunId:'good'};const response=await post(pair);expect(response.status).toBe(200);const diff=await response.json();expect(diff).toMatchObject({...pair,analyzerVersion:2,fingerprintVersion:1});expect(diff.diffId).not.toBe(stale.diffId);
  expect(diff.rows.map((r:any)=>[r.match,r.matchBasis])).toEqual([['inferred','structural-identity-only'],['exact','exact-fingerprint']]);
  expect(diff.warnings).toContain('1 of 2 aligned step pairs are inferred.');expect(await (await fetch(base+'/api/diffs/'+diff.diffId)).json()).toEqual(diff);
  for(const body of [{}, {...pair,goodRunId:'bad'},{...pair,extra:true},{...pair,badRunId:'a/b'},{...pair,badRunId:'x'.repeat(513)}])expect((await post(body)).status).toBe(400);
  expect((await post({...pair,goodRunId:'missing'})).status).toBe(404);
  expect((await post(pair,{'Content-Type':'text/plain'})).status).toBe(415);
  expect((await fetch(base+'/api/diffs')).status).toBe(405);
  expect((await fetch(base+'/api/diffs/not-valid')).status).toBe(400);
  for(const path of ['/api/diffs','/api/diffs/'+diff.diffId]) {
   for(const Origin of ['https://foreign.example','null','http://localhost.evil'])expect((await fetch(base+path,{headers:{Origin}})).status).toBe(403);
   const code=await new Promise<number>(resolve=>get(base+path,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode!);}));expect(code).toBe(403);
  }
  expect((await post(pair,{Origin:'https://foreign.example'})).status).toBe(403);
  await hub.drop('good');expect((await fetch(base+'/api/diffs/'+diff.diffId)).status).toBe(404);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await hub.close();}
});
