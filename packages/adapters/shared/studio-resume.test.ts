import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createClaudeCodeStudio } from "../claude-code/src/studio.js";
import { createCodexStudio } from "../codex/src/studio.js";
import { ClaudeCodeTraceHub } from "../claude-code/src/hub.js";
import { CodexTraceHub } from "../codex/src/hub.js";

async function listen(server: Server) {
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  return `http://127.0.0.1:${(server.address() as {port:number}).port}`;
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
for (const [name,Hub,create] of [["claude-code",ClaudeCodeTraceHub,createClaudeCodeStudio],["codex",CodexTraceHub,createCodexStudio]] as const) describe(`${name} durable Studio`,()=>{
  it("persists order on restart, recovers interrupted status, and resumes HTTP SSE then live",async()=>{
    const dir=mkdtempSync(join(tmpdir(),"atm-resume-")); const file=join(dir,"runs.db");
    let hub=new Hub({path:file,now:()=>1}); let server=create({hub,root:process.cwd(),hookToken:"t"});
    try {
      let url=await listen(server);
      const post=async(base:string,id:string)=>fetch(base+"/hook?token=t",{method:"POST",body:JSON.stringify({session_id:"s",hook_event_name:"UserPromptSubmit",prompt:"hello",event_id:id})});
      expect((await post(url,"p1")).status).toBe(200);const original=await hub.store.readRun("s");
      await close(server);await hub.close();
      hub=new Hub({path:file,now:()=>2});server=create({hub,root:process.cwd(),hookToken:"t"});url=await listen(server);
      expect((await (await fetch(url+"/sessions")).json())[0]).toMatchObject({id:"s",status:"interrupted",live:false});
      expect(await hub.store.readRun("s")).toEqual(original);
      expect((await post(url,"p1")).status).toBe(200);expect(await hub.store.readRun("s")).toEqual(original);
      await post(url,"p2");const stored=await hub.store.readRun("s");const cursor=original.at(-1)!.sequence;
      for (const header of [false,true]) {
        const abort=new AbortController();const response=await fetch(url+`/sse?session=s&after=${header?999:cursor}`,{signal:abort.signal,headers:header?{"Last-Event-ID":String(cursor)}:{}});
        const reader=response.body!.getReader(); const decoder=new TextDecoder();let text="";
        while ((text.match(/\n\n/g)?.length??0)<stored.length-original.length) text+=decoder.decode((await reader.read()).value);
        const frames=text.trim().split("\n\n");expect(frames.map(frame=>Number(/^id: (\d+)/.exec(frame)![1]))).toEqual(stored.filter(e=>e.sequence>cursor).map(e=>e.sequence));
        for (const frame of frames) expect(JSON.parse(frame.split("data: ")[1]).type).toBeDefined();
        await hub.updateMetadata("s",{model:header?"second":"first"});
        const next=decoder.decode((await reader.read()).value);expect(next).toContain(`id: ${stored.length+1}`);
        abort.abort();await reader.cancel().catch(()=>{});
        // The second connection also replays the metadata committed above.
        if (!header) stored.push((await hub.store.readRun("s")).at(-1)!);
      }
      expect((await fetch(url+"/sse?session=s&after=-1")).status).toBe(400);
      expect((await fetch(url+"/hook?token=t",{method:"POST",body:"x".repeat(1024*1024+1)})).status).toBe(400);
      await fetch(url+"/sessions/s",{method:"DELETE"});expect(await hub.store.readRun("s")).toEqual([]);
    } finally {await close(server);await hub.close();rmSync(dir,{recursive:true,force:true});}
  });
});
