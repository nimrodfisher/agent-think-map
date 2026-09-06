/** Isolated synthetic history for browser acceptance; never touches the default database. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexTraceHub } from "../packages/adapters/codex/src/hub.js";
import { createCodexStudio } from "../packages/adapters/codex/src/studio.js";
import { seedHistory } from "../packages/core/test/history-fixture.js";
import type { SqliteRunStore } from "../packages/core/src/sqlite-run-store.js";
const directory=mkdtempSync(join(tmpdir(),"atm-history-preview-"));
const hub=new CodexTraceHub({path:join(directory,"runs.db"),recover:false});
await seedHistory(hub.store as SqliteRunStore);
const server=createCodexStudio({hub,root:process.cwd(),hookToken:"isolated-preview"});
server.listen(0,"127.0.0.1",()=>console.log(`History preview: http://127.0.0.1:${(server.address() as {port:number}).port}`));
async function stop() {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await hub.close();rmSync(directory,{recursive:true,force:true});process.exit(0);}
process.on("SIGINT",()=>void stop());process.on("SIGTERM",()=>void stop());
