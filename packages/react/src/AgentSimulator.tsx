import { useEffect, useRef, type ReactNode } from "react";
import type { AgentTraceEvent } from "../../protocol/src/index.js";
import { parseAgentTraceEvent } from "../../protocol/src/index.js";
import type { TraceNode } from "../../core/src/index.js";
import { ChatPane } from "./ChatPane.js";
import { Inspector } from "./Inspector.js";
import { SplitStage } from "./SplitStage.js";
import { Timeline } from "./Timeline.js";
import { TraceCanvas } from "./TraceCanvas.js";
import { createTraceStore, TraceStoreProvider, useTraceStore, type TraceStore } from "./store.js";

export type SimulatorLayout = "split" | "canvas-only" | "overlay";

export interface AgentSimulatorProps {
  events?: AgentTraceEvent[] | AsyncIterable<AgentTraceEvent>;
  eventsUrl?: string;
  replay?: boolean;
  intervalMs?: number;
  layout?: SimulatorLayout;
  children?: ReactNode;
  onNodeSelect?: (node: TraceNode | undefined) => void;
}

function isAsyncIterable(
  value: AgentTraceEvent[] | AsyncIterable<AgentTraceEvent>,
): value is AsyncIterable<AgentTraceEvent> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function Playback({
  events,
  eventsUrl,
  replay,
  intervalMs,
}: Pick<AgentSimulatorProps, "events" | "eventsUrl" | "replay" | "intervalMs">) {
  const apply = useTraceStore((state) => state.apply);
  const reset = useTraceStore((state) => state.reset);

  useEffect(() => {
    reset();
    if (!events && !eventsUrl) return;

    if (eventsUrl) {
      const source = new EventSource(eventsUrl);
      source.onmessage = (message) => {
        try {
          apply(parseAgentTraceEvent(JSON.parse(message.data)));
        } catch {
          /* ignore malformed frames */
        }
      };
      return () => source.close();
    }

    if (!events) return;

    if (isAsyncIterable(events)) {
      const iterable = events;
      let cancelled = false;
      void (async () => {
        for await (const event of iterable) {
          if (cancelled) break;
          apply(event);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!replay) {
      for (const event of events) apply(event);
      return;
    }

    let index = 0;
    const id = window.setInterval(() => {
      if (index >= events.length) {
        window.clearInterval(id);
        return;
      }
      apply(events[index]);
      index += 1;
    }, intervalMs ?? 420);
    return () => window.clearInterval(id);
  }, [apply, events, eventsUrl, intervalMs, replay, reset]);

  return null;
}

function SelectionBridge({
  onNodeSelect,
}: {
  onNodeSelect?: (node: TraceNode | undefined) => void;
}) {
  const selected = useTraceStore((state) =>
    state.nodes.find((node) => node.id === state.selectedNodeId),
  );
  useEffect(() => {
    onNodeSelect?.(selected);
  }, [onNodeSelect, selected]);
  return null;
}

export function AgentSimulator({
  events,
  eventsUrl,
  replay = true,
  intervalMs = 420,
  layout = "split",
  children,
  onNodeSelect,
}: AgentSimulatorProps) {
  const storeRef = useRef<TraceStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createTraceStore();
  }

  const showChat = layout === "split" && children;
  const showInspector = layout !== "canvas-only";

  return (
    <TraceStoreProvider value={storeRef.current}>
      <div className="atc-root" data-layout={layout}>
        <Playback
          events={events}
          eventsUrl={eventsUrl}
          replay={replay}
          intervalMs={intervalMs}
        />
        <SelectionBridge onNodeSelect={onNodeSelect} />
        {layout === "split" ? (
          <SplitStage
            chat={showChat ? <ChatPane>{children}</ChatPane> : undefined}
            canvas={<TraceCanvas />}
            inspector={showInspector ? <Inspector /> : undefined}
          />
        ) : (
          <div className="atc-stage">
            <TraceCanvas />
            {showInspector ? <Inspector /> : null}
          </div>
        )}
        <Timeline />
      </div>
    </TraceStoreProvider>
  );
}
