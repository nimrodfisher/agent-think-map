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
          <span className="atc-kicker">Canvas demo · recorded sample</span>
          <h1>agent-think-map</h1>
          <p>
            The visual debugger for AI agents. See the execution path behind every
            answer: tools, skills, MCP calls, subagents, latency, and cost. No API key.
          </p>
          <p>
            Studio also offers searchable run history, Claude Code history import,
            evidence-aware comparison, agent handoffs, and recurring problems.
            {" "}<a href="https://github.com/nimrodfisher/agent-think-map#try-the-new-studio">Try Studio locally</a>
            {" · "}<a href="https://github.com/nimrodfisher/agent-think-map#connect-your-coding-agent">Connect Claude Code or Codex</a>
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
