import { describe, expect, it } from "vitest";
import { ClaudeCodeTraceHub } from "../../adapters/claude-code/src/hub.js";
import { CodexTraceHub } from "../../adapters/codex/src/hub.js";
import { SqliteRunStore } from "./sqlite-run-store.js";
import { TraceHub } from "./trace-hub.js";
import { reduceTraceAll } from "./index.js";

for (const Hub of [ClaudeCodeTraceHub,CodexTraceHub]) describe(`${Hub.name} shared contract`,()=>{
  it("discards a live adapter after history is deleted through another store caller",async()=>{
    const hub=new Hub({path:":memory:",now:()=>10});
    try {
      await hub.ingest({session_id:"deleted",hook_event_name:"UserPromptSubmit",prompt:"old prompt"});
      await hub.store.deleteRun("deleted");
      await hub.ingest({session_id:"deleted",hook_event_name:"UserPromptSubmit",prompt:"new prompt"});
      const events=await hub.store.readRun("deleted");
      expect(events[0].payload).toMatchObject({type:"run.started",prompt:"new prompt"});
      expect(events[0].sequence).toBe(1);
    }finally{await hub.close();}
  });
  it("shares history queries, patches and index rebuild through the hub",async()=>{
    const hub=new Hub({path:":memory:",recover:false});
    try {
      const ingest=hub.ingest({session_id:"history",hook_event_name:"UserPromptSubmit",prompt:"baseline orchard"});
      const page=await hub.listRuns({q:"orchard",pageSize:1});await ingest;
      expect(page.items[0].runId).toBe("history");
      expect(await hub.patchRun("history",{outcome:"worked",bookmarked:true,label:"reference"})).toMatchObject({outcome:"worked",bookmarked:true,label:"reference"});
      await hub.rebuildSearchIndex();expect((await hub.listRuns({q:"reference",outcome:"worked"})).items).toHaveLength(1);
    }finally{await hub.close();}
  });
  it("restores the conversation spine and generated IDs after adapter eviction",async()=>{
    const hub=new Hub({path:":memory:",now:()=>10});
    try {
      await hub.ingest({session_id:"s",hook_event_name:"UserPromptSubmit",prompt:"hi"});
      await hub.ingest({session_id:"s",hook_event_name:"Stop",last_assistant_message:"answer"});
      const answer=(await hub.store.readRun("s")).find(e=>e.payload.type==="node.started" && e.payload.kind==="answer")!.payload;
      await hub.ingest({session_id:"s",hook_event_name:"SessionEnd"});
      const resumed=await hub.ingest({session_id:"s",hook_event_name:"UserPromptSubmit",prompt:"continue"});
      expect(resumed.find(e=>e.type==="node.started")).toMatchObject({parentId:"id" in answer?answer.id:undefined});
      const state=reduceTraceAll((await hub.store.readRun("s")).map(e=>e.payload));
      expect(new Set(state.nodes.map(node=>node.id)).size).toBe(state.nodes.length);
      expect(state.nodes.find(node=>node.kind==="answer")?.text).toBe("answer");
    }finally{await hub.close();}
  });
  it("deduplicates hooks across adapter reconstruction and preserves legitimate repeats",async()=>{
    const hub=new Hub({path:":memory:",now:()=>10});
    try {
      const hook={session_id:"s",hook_event_name:"UserPromptSubmit",prompt:"hi",event_id:"prompt-1"};
      await hub.ingest(hook);const count=(await hub.store.readRun("s")).length;
      expect(await hub.ingest(hook)).toEqual([]);expect(await hub.store.readRun("s")).toHaveLength(count);
      await hub.ingest({...hook,event_id:"prompt-2"});expect((await hub.store.readRun("s")).length).toBeGreaterThan(count);
      const tool={session_id:"s",hook_event_name:"PreToolUse",tool_use_id:"tool1",tool_name:"Read",tool_input:{file_path:"README.md"}};
      const events=await hub.ingest(tool);expect(events.length).toBeGreaterThan(0);expect(await hub.ingest(tool)).toEqual([]);
      const before=(await hub.store.readRun("s")).length;
      await hub.updateUsage("s",{inputTokens:5});await hub.updateMetadata("s",{model:"test",effort:"high"});
      expect((await hub.store.readRun("s")).slice(before).map(e=>e.payload.type)).toEqual(["run.meta","run.meta"]);
      const seq:number[]=[];const stop=hub.subscribeEnvelopes("s",before,e=>seq.push(e.sequence));
      await hub.ingest({...hook,event_id:"prompt-3"});expect(seq[0]).toBe(before+1);expect(new Set(seq).size).toBe(seq.length);stop();
      expect(await hub.drop("s")).toBe(true);expect(await hub.list()).toEqual([]);
    }finally{await hub.close();}
  });
});
it("provider recovery leaves another provider's live run alone",async()=>{
  const store=new SqliteRunStore({path:":memory:"});
  await store.append({schemaVersion:1,eventId:"e",provider:"codex",sessionId:"s",timestamp:1,payload:{type:"run.started",runId:"s",prompt:"",ts:1}});
  const hub=new TraceHub("claude-code",{store,now:()=>2});await hub.ready;
  expect((await store.getRun("s"))?.status).toBe("running");await hub.close();
});
it("deferred recovery leaves live runs untouched until successful startup",async()=>{
  const store=new SqliteRunStore({path:":memory:"});
  await store.append({schemaVersion:1,eventId:"e",provider:"codex",sessionId:"s",timestamp:1,payload:{type:"run.started",runId:"s",prompt:"",ts:1}});
  const hub=new TraceHub("codex",{store,now:()=>2,recover:false});
  expect((await store.getRun("s"))?.status).toBe("running");await hub.recover();
  expect((await store.getRun("s"))?.status).toBe("interrupted");await hub.close();
});

import { runStoreContract } from "./run-store-contract.js";
for (const Hub of [ClaudeCodeTraceHub,CodexTraceHub]) runStoreContract(`${Hub.name} store contract`, () => new Hub({path:":memory:"}).store);
