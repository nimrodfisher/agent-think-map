import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import {
  initialTraceState,
  reduceTrace,
  type TraceNode,
  type TraceState,
} from "../../core/src/index.js";
import type { AgentTraceEvent } from "../../protocol/src/index.js";

export interface TraceStoreState extends TraceState {
  apply: (event: AgentTraceEvent) => void;
  select: (id: string | undefined) => void;
  reset: () => void;
}

export type TraceStore = ReturnType<typeof createTraceStore>;

export function createTraceStore(initial: TraceState = initialTraceState) {
  return createStore<TraceStoreState>((set, get) => ({
    ...initial,
    apply: (event) => set(reduceTrace(get(), event)),
    select: (id) => set({ selectedNodeId: id }),
    reset: () =>
      set((state) => ({
        ...initialTraceState,
        apply: state.apply,
        select: state.select,
        reset: state.reset,
      })),
  }));
}

const TraceStoreContext = createContext<TraceStore | null>(null);

export const TraceStoreProvider = TraceStoreContext.Provider;

export function useTraceStore<T>(selector: (state: TraceStoreState) => T): T {
  const store = useContext(TraceStoreContext);
  if (!store) {
    throw new Error("useTraceStore must be used inside AgentSimulator");
  }
  return useStore(store, selector);
}

export function useSelectedNode(): TraceNode | undefined {
  return useTraceStore((state) =>
    state.nodes.find((node) => node.id === state.selectedNodeId),
  );
}
