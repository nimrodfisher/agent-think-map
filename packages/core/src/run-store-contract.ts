import { describe, expect, it } from "vitest";
import type { AppendDraft, RunStore } from "./run-store.js";

export const draft = (eventId: string, sessionId = "run", ts = 1): AppendDraft => ({
  schemaVersion: 1, eventId, provider: "custom", sessionId, timestamp: ts,
  payload: { type: "node.delta", id: "tool", text: "repeat", ts },
});
export function runStoreContract(name: string, create: () => RunStore) {
  describe(name, () => {
    it("deduplicates IDs, preserves repeats, and allocates contiguous concurrent sequences", async () => {
      const store = create();
      try {
        const results = await Promise.all(Array.from({ length: 25 },(_,i) => store.append(draft(`e${i}`))));
        expect(results.map(result => result.envelope.sequence)).toEqual(Array.from({ length: 25 },(_,i) => i+1));
        expect((await store.append(draft("e0"))).inserted).toBe(false);
        expect(await store.readRun("run",23)).toHaveLength(2);
        expect((await store.getRun("run"))?.eventCount).toBe(25);
        await expect(store.append(draft("e0","other"))).rejects.toThrow(/another run/);
      } finally { await store.close(); }
    });
    it("paginates, persists annotations, protects running/bookmarked data, and deletes", async () => {
      const store = create();
      try {
        for (let i=0;i<4;i++) await store.append(draft(`e${i}`,`r${i}`,i));
        const first = await store.listRuns({limit:2}); const next = await store.listRuns({limit:2,cursor:first.nextCursor});
        expect([...first.items,...next.items].map(run => run.runId)).toEqual(["r3","r2","r1","r0"]);
        expect(next.nextCursor).toBeUndefined();
        await store.setBookmark("r0",true,"keep"); await store.setOutcome("r0","worked");
        expect(await store.getRun("r0")).toMatchObject({bookmarked:true,label:"keep",outcome:"worked"});
        expect(await store.prune({maxRuns:0})).toBe(0);
        expect(await store.markInterrupted(3)).toBe(3);
        expect(await store.prune({maxRuns:0})).toBe(2);
        expect(await store.prune({maxBytes:0,includeRunning:true})).toBe(1);
        expect(await store.prune({before:10,includeBookmarked:true})).toBe(1);
        await store.append(draft("new")); expect(await store.deleteRun("run")).toBe(true);
        expect(await store.readRun("run")).toEqual([]); expect(await store.deleteRun("run")).toBe(false);
      } finally { await store.close(); }
    });
    it("replays after cursor and drains an append inside the replay callback exactly once", async () => {
      const store = create();
      try {
        await store.append(draft("a")); await store.append(draft("b"));
        const sequences: number[] = []; let added: Promise<unknown> | undefined;
        const stop = store.subscribe("run",1,event => { sequences.push(event.sequence); if (event.sequence === 2) added = store.append(draft("c")); });
        await added; await store.append(draft("d"));
        expect(sequences).toEqual([2,3,4]); stop(); await store.append(draft("e")); expect(sequences).toEqual([2,3,4]);
      } finally { await store.close(); }
    });
  });
}
