import { useCallback, useRef, useState } from "react";
import { githubIssueFixture, type TraceNode } from "@agent-think-map/core";
import { AgentSimulator } from "@agent-think-map/react";
import { failedReadFixture, failedReadId } from "./fixtures/failed-read.js";

export const replayIntervalMs = 380;

export default function App() {
  const [sample, setSample] = useState("failure");
  const [epoch, setEpoch] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const pendingInspection = useRef(false);
  const selected = useRef<TraceNode | undefined>(undefined);
  const stage = useRef<HTMLDivElement>(null);
  const events = sample === "failure" ? failedReadFixture : githubIssueFixture;

  const revealInspector = useCallback(() => {
    const inspector = stage.current?.querySelector<HTMLElement>(".atc-inspector");
    if (!inspector) return;
    inspector.tabIndex = -1;
    inspector.focus({ preventScroll: true });
    inspector.scrollIntoView({ block: "nearest" });
  }, []);

  const onNodeSelect = useCallback((node: TraceNode | undefined) => {
    selected.current = node;
    // Keep an early inspect request until the replay creates its target.
    if (pendingInspection.current && (node?.id !== failedReadId || node.status !== "failed")) return;
    setSelectedNodeId(node?.id);
    if (pendingInspection.current) {
      pendingInspection.current = false;
      revealInspector();
    }
  }, [revealInspector]);

  function reset(nextSample = sample) {
    pendingInspection.current = false;
    selected.current = undefined;
    setSelectedNodeId(undefined);
    setSample(nextSample);
    setEpoch((value) => value + 1);
  }

  function inspectFailure() {
    if (selected.current?.id === failedReadId && selected.current.status === "failed") {
      revealInspector();
    } else {
      pendingInspection.current = true;
      setSelectedNodeId(failedReadId);
    }
  }

  return (
    <div className="demo-player">
      <div className="demo-actions">
        <label>Sample
          <select value={sample} onChange={(event) => reset(event.target.value)}>
            <option value="failure">SYNTHETIC · Failed configuration Read</option>
            <option value="github">Original · GitHub issue success</option>
          </select>
        </label>
        {sample === "failure" && <button type="button" onClick={inspectFailure}>Inspect the failed step</button>}
        <button type="button" onClick={() => reset()}>Replay sample</button>
      </div>
      <p className="demo-caption">
        {sample === "failure"
          ? "SYNTHETIC · A configuration Read fails, then the agent answers. A completed run does not verify the answer."
          : "Original recorded sample · Read → GitHub issue → answer. Captured events only; available detail depends on the runtime."}
      </p>
      <div className="demo-stage" ref={stage} aria-label="Interactive trace sample">
        <AgentSimulator key={`${sample}-${epoch}`} events={events} layout="split" replay
          intervalMs={replayIntervalMs} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect} />
      </div>
    </div>
  );
}
