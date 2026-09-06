import { describe, expect, it } from "vitest";
import { buildSearchDocument, normalizeSearch } from "./run-search.js";

describe("bounded materialized search normalization", () => {
  it("normalizes accents, camel case and tool namespaces and indexes all intended fields", () => {
    const doc = buildSearchDocument({prompt:"Fix café",model:"Model-X",label:"good pair"},[
      {type:"node.started",id:"t",kind:"mcp",title:"mcp__server__readFile",ts:1},
      {type:"node.completed",id:"t",outputPreview:"Answer pineapple",ts:2},
      {type:"node.failed",id:"t",error:"Permission denied",ts:3},
      {type:"node.delta",id:"t",text:"rawsecret",ts:4},
      {type:"tool.input",id:"t",partial:"filesecret",ts:5},
    ]);
    for (const value of ["cafe","model x","read file","pineapple","permission denied","good pair"]) expect(doc).toContain(value);
    expect(doc).not.toContain("rawsecret"); expect(doc).not.toContain("filesecret");
    expect(normalizeSearch("MCP__read_file")).toBe("mcp read file");
  });
  it("caps individual previews and field totals", () => {
    const doc = buildSearchDocument({prompt:"p"},Array.from({length:100},(_,i)=>({type:"node.completed" as const,id:String(i),outputPreview:"x".repeat(1024)+"beyondpreview",ts:1})));
    expect(doc).not.toContain("beyondpreview"); expect(doc.length).toBeLessThan(8300);
  });
});
