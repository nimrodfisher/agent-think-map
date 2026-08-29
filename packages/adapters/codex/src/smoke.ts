export const SMOKE = [
  {
    session_id: "smoke",
    hook_event_name: "UserPromptSubmit",
    prompt: "Read README.md and summarize it",
    model: "gpt-5.4",
  },
  {
    session_id: "smoke",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_use_id: "call_smoke",
    tool_input: { command: "cat README.md" },
  },
  {
    session_id: "smoke",
    hook_event_name: "PostToolUse",
    tool_use_id: "call_smoke",
    tool_response: { exit_code: 0, output: "agent-think-map — see the agent think" },
  },
  {
    session_id: "smoke",
    hook_event_name: "Stop",
    last_assistant_message: "It is an embeddable think-map for agent traces.",
  },
];
