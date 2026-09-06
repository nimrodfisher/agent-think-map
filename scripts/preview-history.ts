/** Isolated synthetic history for browser acceptance; never touches the default database. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexTraceHub } from "../packages/adapters/codex/src/hub.js";
import { createCodexStudio } from "../packages/adapters/codex/src/studio.js";
import { seedHistory } from "../packages/core/test/history-fixture.js";
import type { SqliteRunStore } from "../packages/core/src/sqlite-run-store.js";
import type { AgentTraceEvent } from "../packages/protocol/src/index.js";
const directory=mkdtempSync(join(tmpdir(),"atm-history-preview-"));
const hub=new CodexTraceHub({path:join(directory,"runs.db"),recover:false});
await seedHistory(hub.store as SqliteRunStore);
const tasks = ['Fix checkout redirect','Investigate deployment permissions','Add retry handling','Review authentication changes','Repair failing integration tests','Trace the payment webhook'];
for (const [index,prompt] of tasks.entries()) {
  const id = `preview-${index}`, ts = Date.now() - (index+1)*240000, failed = index%2 === 0;
  const events: AgentTraceEvent[] = [
    {type:'run.started',runId:id,prompt,ts},
    {type:'run.meta',runId:id,model:index%2 ? 'codex' : 'claude',ts},
    {type:'node.started',id:'agent',kind:'subagent',title:'Implementer',reason:'Inspect the code and apply the requested change',ts:ts+1000},
    {type:'node.started',id:'reader',parentId:'agent',kind:'subagent',title:'Code explorer',reason:'Locate the relevant configuration',ts:ts+2000},
    {type:'node.started',id:'read',parentId:'reader',kind:'tool',title:'Read configuration',operation:{name:'read',server:'filesystem'},ts:ts+3000},
    {type:'tool.input',id:'read',partial:'{"path":"./config/app.json"}',ts:ts+3100},
    failed ? {type:'node.failed',id:'read',error:'Permission denied while reading configuration',ts:ts+4500} : {type:'node.completed',id:'read',outputPreview:'Configuration loaded successfully',durationMs:1500,ts:ts+4500},
    {type:'node.completed',id:'reader',outputPreview:failed ? 'Could not inspect configuration; permission check needed.' : 'Located the configuration.',ts:ts+5000},
    {type:'node.completed',id:'agent',outputPreview:failed ? 'Investigation needs a permissions check.' : 'Change implemented and checked.',ts:ts+7000},
    {type:'run.completed',runId:id,usage:{costUsd:0.04,inputTokens:1800,outputTokens:500},ts:ts+8000},
  ];
  await hub.store.appendBatch!(events.map((payload,n) => ({schemaVersion:1,provider:index%2 ? 'codex' : 'claude-code',sessionId:id,eventId:`${id}:${n}`,timestamp:payload.ts,payload})));
  await hub.store.patchRun(id,{outcome:failed ? 'failed' : 'worked',bookmarked:index===2});
}
const server=createCodexStudio({hub,root:process.cwd(),hookToken:"isolated-preview"});
server.listen(Number(process.env.ATM_PREVIEW_PORT ?? 0),"127.0.0.1",()=>console.log(`History preview: http://127.0.0.1:${(server.address() as {port:number}).port}`));
async function stop() {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await hub.close();rmSync(directory,{recursive:true,force:true});process.exit(0);}
process.on("SIGINT",()=>void stop());process.on("SIGTERM",()=>void stop());
