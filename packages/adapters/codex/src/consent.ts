import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CodexConsent = "pending" | "enabled" | "disabled";
export type SessionConsent = CodexConsent | "skipped";

interface ConsentFile {
  consent: CodexConsent;
  sessions?: Record<
    string,
    {
      consent: SessionConsent;
      prompt?: string;
    }
  >;
}

export interface ConsentDecision {
  consent: CodexConsent;
  sessionConsent: SessionConsent;
  forward: string[];
  output?: Record<string, unknown>;
}

const CONSENT_DIR = ".agent-think-map";
const CONSENT_FILE = "codex-consent.json";

export function codexConsentPath(home = homedir()): string {
  return join(home, CONSENT_DIR, CONSENT_FILE);
}

function readConsent(home: string): ConsentFile {
  const file = codexConsentPath(home);
  if (!existsSync(file)) return { consent: "pending", sessions: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ConsentFile>;
    return {
      consent:
        parsed.consent === "enabled" || parsed.consent === "disabled"
          ? parsed.consent
          : "pending",
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    return { consent: "pending", sessions: {} };
  }
}

function writeConsent(home: string, state: ConsentFile): void {
  const dir = join(home, CONSENT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(codexConsentPath(home), `${JSON.stringify(state, null, 2)}\n`);
}

function promptFromBody(body: string): string {
  try {
    const input = JSON.parse(body) as Record<string, unknown>;
    return typeof input.prompt === "string" ? input.prompt : "";
  } catch {
    return "";
  }
}

export function resetCodexConsent(home = homedir()): void {
  writeConsent(home, { consent: "pending", sessions: {} });
}

export function decideCodexConsent(
  body: string,
  home = homedir(),
): ConsentDecision {
  const input = JSON.parse(body) as Record<string, unknown>;
  const sessionId = typeof input.session_id === "string" ? input.session_id : "session";
  const event = input.hook_event_name;
  const state = readConsent(home);
  const sessions = state.sessions ?? {};
  const session = sessions[sessionId];
  const current = session?.consent ?? (state.consent === "enabled" ? "enabled" : state.consent);

  if (event === "SessionStart") {
    if (current === "enabled") {
      return { consent: state.consent, sessionConsent: "enabled", forward: [body] };
    }
    if (current === "disabled" || current === "skipped") {
      return { consent: state.consent, sessionConsent: current, forward: [] };
    }
    return { consent: state.consent, sessionConsent: "pending", forward: [] };
  }

  if (current === "enabled") {
    return { consent: state.consent, sessionConsent: "enabled", forward: [body] };
  }
  if (current === "disabled" || current === "skipped") {
    return { consent: state.consent, sessionConsent: current, forward: [] };
  }

  if (event !== "UserPromptSubmit") {
    return { consent: state.consent, sessionConsent: "pending", forward: [] };
  }

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const answer = prompt.toLowerCase().replace(/[.!?,]+$/g, "");
  const yes = /^(y|yes|yeah|yep|sure|enable|enable it|go ahead)$/.test(answer);
  const no = /^(n|no|no thanks|disable|don't|do not)$/.test(answer);
  const later = /^(later|maybe later|not now|ask me later)$/.test(answer);

  if (yes || no || later) {
    const pendingPrompt = session?.prompt;
    const nextConsent: CodexConsent = yes ? "enabled" : no ? "disabled" : "pending";
    const nextSession: SessionConsent = yes ? "enabled" : no ? "disabled" : "skipped";
    state.consent = nextConsent;
    sessions[sessionId] = { consent: nextSession };
    writeConsent(home, { consent: state.consent, sessions });

    const forward = yes && pendingPrompt ? [pendingPrompt] : [];
    const status = yes
      ? "Agent Think Map is enabled for this and future Codex sessions."
      : no
        ? "Agent Think Map is disabled. This session will continue without sharing prompts or tool events."
        : "Agent Think Map is deferred for this session. No prompts or tool events will be shared.";
    const output: Record<string, unknown> = {
      systemMessage: status,
    };
    const originalPrompt = pendingPrompt ? promptFromBody(pendingPrompt) : "";
    const originalRequest = originalPrompt
      ? ` Original user request: ${originalPrompt.slice(0, 12000)}`
      : "";
    if (yes && pendingPrompt) {
      output.hookSpecificOutput = {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "The user opted into Agent Think Map. Continue the original request from immediately before the consent question." +
          originalRequest,
      };
    } else if (!yes && pendingPrompt) {
      output.hookSpecificOutput = {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "Continue the original user request from immediately before the Agent Think Map consent question, without using Agent Think Map." +
          originalRequest,
      };
    }
    return {
      consent: state.consent,
      sessionConsent: nextSession,
      forward,
      output,
    };
  }

  sessions[sessionId] = { consent: "pending", prompt: body };
  writeConsent(home, { consent: state.consent, sessions });
  return {
    consent: state.consent,
    sessionConsent: "pending",
    forward: [],
    output: {
      decision: "block",
      reason:
        "Agent Think Map is installed. Reply yes to share this and future sessions' prompts and tool events with the local map, no to continue without it, or later to defer.",
    },
  };
}
