/** Synthetic comparison fixture only; disposable SQLite, no provider sessions. */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CodexTraceHub} from '../packages/adapters/codex/src/hub.js';
import {createCodexStudio} from '../packages/adapters/codex/src/studio.js';
import {trace} from '../packages/core/test/comparison-fixture.js';
const directory=mkdtempSync(join(tmpdir(),'atm-comparison-preview-'));
const hub=new CodexTraceHub({path:join(directory,'runs.db'),recover:false});
for(const id of ['bad','good']){
 for(const payload of trace([{name:'read',input:{path:'/tmp/example.ts'}},{name:'bash',input:{command:id==='good'?'npm test':'npm run build'}},{name:'read',input:{path:'/tmp/result.json'},failed:id==='bad'}],id))await hub.append(payload,id);
 await hub.patchRun(id,{outcome:id==='good'?'worked':'failed',label:'Synthetic '+(id==='good'?'Worked baseline':'Failed candidate')});
}
const server=createCodexStudio({hub,root:process.cwd(),hookToken:'isolated-preview'});
server.listen(0,'127.0.0.1',()=>console.log('Comparison preview: http://127.0.0.1:'+(server.address() as {port:number}).port));
async function stop(){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await hub.close();rmSync(directory,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
