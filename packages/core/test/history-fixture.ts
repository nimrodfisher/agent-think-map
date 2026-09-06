import type { SqliteRunStore } from "../src/sqlite-run-store.js";
import type { AppendDraft } from "../src/run-store.js";
export async function seedHistory(store:SqliteRunStore, count=24) {
  for(let i=0;i<count;i++) {
    const id=`run-${String(i).padStart(2,"0")}`;
    const base={schemaVersion:1 as const,provider:i%2 ? "codex" as const : "claude-code" as const,sessionId:id,timestamp:1000};
    const payloads:AppendDraft["payload"][]=[
      {type:"run.started",runId:id,prompt:`Orchard task ${i}`,ts:1000},
      {type:"run.meta",runId:id,model:"model-shared",ts:1000},
      {type:"node.started",id:"t",kind:"tool",title:"mcp__fs__readFile",ts:1000},
      {type:"node.delta",id:"t",text:"rawsecret",ts:1000},
      {type:"node.completed",id:"t",outputPreview:"Pineapple answer",ts:1000},
      {type:"node.failed",id:"t",error:"Permission denied",ts:1000},
    ];
    if(i%3 !== 0) payloads.push({type:"run.completed",runId:id,ts:1000});
    await store.appendBatch(payloads.map((payload,n)=>({...base,payload,eventId:`${id}:${n}`})));
    if(i%3 === 1) await store.patchRun(id,{outcome:"worked"});
    if(i%3 === 2) await store.patchRun(id,{outcome:"failed"});
  }
}