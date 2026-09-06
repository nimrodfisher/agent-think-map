import { describe, expect, it, vi } from "vitest";
import { get, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexStudio } from "../codex/src/studio.js";
import { createClaudeCodeStudio } from "../claude-code/src/studio.js";
import { CodexTraceHub } from "../codex/src/hub.js";
import { ClaudeCodeTraceHub } from "../claude-code/src/hub.js";
import { SqliteRunStore } from "../../core/src/sqlite-run-store.js";
import { seedHistory } from "../../core/test/history-fixture.js";
const listen=async(server:Server)=>{await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;};
const close=async(server:Server)=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));};
for(const [provider,Hub,create] of [["codex",CodexTraceHub,createCodexStudio],["claude-code",ClaudeCodeTraceHub,createClaudeCodeStudio]] as const) describe(`${provider} shared history API`,()=>{
  it("serves and validates imported-origin filters",async()=>{
    const hub=new Hub({path:":memory:",recover:false});
    for(const origin of ['live','imported'] as const) await hub.store.append({schemaVersion:1,eventId:origin,sessionId:origin,provider:'claude-code',timestamp:1,payload:{type:'run.started',runId:origin,prompt:'History',ts:1},...(origin==='imported'?{origin}:{})});
    const server=create({hub:hub as any,root:process.cwd()}),base=await listen(server);
    try {
      for(const origin of ['live','imported']) {
        const page=await (await fetch(base+'/api/runs?origin='+origin)).json();
        expect(page.items).toHaveLength(1); expect(page.items[0]).toMatchObject({runId:origin,origin});
      }
      expect((await fetch(base+'/api/runs?origin=unknown')).status).toBe(400);
      expect((await fetch(base+'/api/runs?origin=live&origin=imported')).status).toBe(400);
    }finally{await close(server);await hub.close();}
  });
  it("finds and labels a good/bad pair in 24 mixed runs across Studio restart",async()=>{
    const dir=mkdtempSync(join(tmpdir(),"atm-history-api-"));const path=join(dir,"runs.db");
    let hub=new Hub({path,recover:false});await seedHistory(hub.store as SqliteRunStore);
    let server=create({hub:hub as any,root:process.cwd()});let base=await listen(server);
    const request=(suffix:string,init?:RequestInit)=>fetch(base+suffix,init);
    const patch=(id:string,body:unknown)=>request('/api/runs/'+id,{method:"PATCH",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify(body)});
    try {
      const calls=vi.spyOn(hub.store,"listRuns");
      expect((await (await request('/api/runs/run-23')).json()).runId).toBe('run-23');
      const problems=await (await request('/api/problems')).json();
      expect(problems.partial).toBe(false); expect(problems.items.reduce((sum:number,item:any)=>sum+item.count,0)).toBe(24);
      expect((await request('/api/problems?provider=codex')).status).toBe(400);
      expect((await request('/api/problems',{method:'POST'})).status).toBe(405);
      const page=await (await request("/api/runs")).json();expect(page.items).toHaveLength(20);expect(page.nextCursor).toBeTruthy();
      const page2=await (await request("/api/runs?cursor="+encodeURIComponent(page.nextCursor))).json();
      expect(new Set([...page.items,...page2.items].map(x=>x.runId)).size).toBe(24);
      expect(calls.mock.calls.every(([filter])=>filter.pageSize!<=100)).toBe(true);
      for(const q of ["orchard","read_file","model-shared","pineapple","permission denied"]) expect((await (await request('/api/runs?q='+encodeURIComponent(q))).json()).items).toHaveLength(20);
      expect((await (await request('/api/runs?q=rawsecret')).json()).items).toEqual([]);
      const ids:string[]=[];let cursor:string|undefined;
      do {
        const params=new URLSearchParams({provider:"codex",status:"completed",outcome:"worked",limit:"2"});if(cursor)params.set("cursor",cursor);
        const result=await (await request('/api/runs?'+params)).json();ids.push(...result.items.map((x:any)=>x.runId));cursor=result.nextCursor;
      }while(cursor);
      expect(ids).toEqual(["run-01","run-07","run-13","run-19"]);
      expect((await patch("run-00",{outcome:"worked",bookmarked:true,label:"Successful baseline"})).status).toBe(200);
      expect((await patch("run-02",{outcome:"failed",bookmarked:true,label:"Failure candidate"})).status).toBe(200);
      await close(server);await hub.close();hub=new Hub({path,recover:false});server=create({hub:hub as any,root:process.cwd()});base=await listen(server);
      const saved=await (await request('/api/runs?q=successful&bookmarked=true&outcome=worked')).json();expect(saved.items[0]).toMatchObject({runId:"run-00",label:"Successful baseline"});
      expect((await (await request('/api/runs?q=failure&outcome=failed')).json()).items[0].runId).toBe("run-02");
      expect((await (await request('/api/runs/run-00/events?after=4')).json()).items.map((x:any)=>x.sequence)).toEqual([5,6]);
      expect((await request('/api/runs/run-00',{method:"DELETE",headers:{Origin:base}})).status).toBe(204);
      expect((await (await request('/api/runs?q=successful')).json()).items).toEqual([]);
      expect((await request('/api/runs/run-00/events')).status).toBe(404);
      expect(await hub.store.readRun("run-00")).toEqual([]);
      const legacy=await request('/sessions?limit=2');expect(await legacy.json()).toHaveLength(2);expect(legacy.headers.get("x-next-cursor")).toBeTruthy();
    }finally{await close(server);await hub.close();rmSync(dir,{recursive:true,force:true});}
  });
  it("validates each route and rejects foreign origins and rebound hosts before store access",async()=>{
    const hub=new Hub({path:":memory:",recover:false});await seedHistory(hub.store as SqliteRunStore,1);
    const server=create({hub:hub as any,root:process.cwd()});const base=await listen(server);
    try {
      const access=vi.spyOn(hub.store,"getRun");const list=vi.spyOn(hub,"listRuns");
      for(const [path,method] of [["/api/problems","GET"],["/api/runs","GET"],["/api/runs/run-00","GET"],["/api/runs/run-00/events","GET"],["/api/runs/run-00","PATCH"],["/api/runs/run-00","DELETE"],["/api/runs","OPTIONS"]]) {
        for(const Origin of ["https://evil.example","null",base+".evil.example"]) {
          const res=await fetch(base+path,{method,headers:{Origin}});expect(res.status).toBe(403);expect(await res.json()).toMatchObject({error:{code:"forbidden_origin"}});
        }
        const status=await new Promise(resolve=>get(base+path,{method,headers:{Host:"evil.example"}},res=>{res.resume();resolve(res.statusCode);}));expect(status).toBe(403);
      }
      expect(access).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();
      for(const suffix of ['?limit=0','?limit=101','?limit=1.5','?limit=2&limit=3','?q='+"a".repeat(257),'?provider=invalid','?model='+"a".repeat(257),'?status=invalid','?outcome=success','?bookmarked=1','?from=no','?from=2&to=1','?cursor=bad','?cursor='+encodeURIComponent('[1,"id","extra"]'),'?unknown=x']) {
        const res=await fetch(base+'/api/runs'+suffix);expect(res.status,suffix).toBe(400);expect(await res.json()).toMatchObject({error:{code:"invalid_request"}});
      }
      for(const path of ['/api/runs/%ZZ/events','/api/runs/%00/events','/api/runs/'+"a".repeat(513)+'/events','/api/runs/run-00/events?after=-1','/api/runs/run-00/events?after=1.2','/api/runs/run-00/events?after=9007199254740992']) expect((await fetch(base+path)).status,path).toBe(400);
      for(const body of [{outcome:"success"},{bookmarked:"true"},{label:"a".repeat(121)},{unknown:1},{},null,[]]) expect((await fetch(base+'/api/runs/run-00',{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).status).toBe(400);
      expect((await fetch(base+'/api/runs/run-00',{method:"PATCH",body:'{}'})).status).toBe(415);
      for(const body of ['{',JSON.stringify({label:'x'.repeat(5000)})]) expect((await fetch(base+'/api/runs/run-00',{method:"PATCH",headers:{"Content-Type":"application/json"},body})).status).toBe(400);
      expect((await fetch(base+'/api/runs/run-00',{method:"POST"})).status).toBe(405);
      expect((await fetch(base+'/api/unknown')).status).toBe(404);
      const preflight=await fetch(base+'/api/runs/run-00',{method:"OPTIONS",headers:{Origin:base}});expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH');
    }finally{await close(server);await hub.close();}
  });
});
