import { useMemo, useState } from "react";
import { githubIssueFixture } from "@agent-think-map/core";
import { AgentSimulator } from "@agent-think-map/react";

export default function App() {
  const [epoch, setEpoch] = useState(0);
  const events = useMemo(() => githubIssueFixture, [epoch]);

  return (
    <div className="demo-shell">
      <header className="demo-mast">
        <div>
          <span className="atc-kicker">In-product canvas</span>
          <h1>See the agent think</h1>
          <p>
            Embeddable tracing for chain-of-thought, skills, tools, and MCP inside
            the chat UI you already ship — not a hosted dashboard. No API key.
          </p>
        </div>
        <button type="button" className="demo-replay" onClick={() => setEpoch((n) => n + 1)}>
          Replay turn
        </button>
      </header>
      <div className="demo-stage">
        <AgentSimulator key={epoch} events={events} layout="split" replay intervalMs={380}>
          <div className="demo-chat">
            <span className="atc-kicker">Chat host</span>
            <div className="bubble">{githubIssueFixture[0].type === "run.started" ? githubIssueFixture[0].prompt : ""}</div>
          </div>
        </AgentSimulator>
      </div>
    </div>
  );
}
