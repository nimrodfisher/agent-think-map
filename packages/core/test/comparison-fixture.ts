import type { AgentTraceEvent } from '../../protocol/src/index.js';
export interface Spec {name:string;input?:unknown;failed?:boolean;parent?:number;turn?:number}
export function trace(specs:Spec[],id='run'):AgentTraceEvent[] {
 const events:AgentTraceEvent[]=[{type:'run.started',runId:id,prompt:'Synthetic task',ts:1}];
 specs.forEach((s,i)=>{
  if(s.turn)events.push({type:'node.started',id:id+'-turn-'+i,kind:'user',title:'User',ts:i+2});
  events.push({type:'node.started',id:id+'-'+i,kind:s.name.includes('.')?'mcp':'tool',operation:{name:s.name},title:'Display only',parentId:s.parent===undefined?'user-'+id:id+'-'+s.parent,ts:i+3});
  if(s.input)events.push({type:'tool.input',id:id+'-'+i,partial:JSON.stringify(s.input),ts:i+3});
  events.push(s.failed?{type:'node.failed',id:id+'-'+i,error:'Synthetic failure',ts:i+4}:{type:'node.completed',id:id+'-'+i,outputPreview:'ok',ts:i+4});
 });
 events.push({type:'run.completed',runId:id,ts:100});return events;
}
