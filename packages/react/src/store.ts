import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import {
  initialTraceState,
  reduceTrace,
  type TraceNode,
  type TraceState,
} from "../../core/src/index.js";
import type { AgentTraceEvent } from "../../protocol/src/index.js";
import { ALL_KIND_FILTER, type KindFilter } from "./layout.js";

export interface TraceStoreState extends TraceState {
  hoveredNodeId: string | undefined;
  kindFilter: KindFilter;
  apply: (event: AgentTraceEvent) => void;
  select: (id: string | undefined) => void;
  hover: (id: string | undefined) => void;
  setKindFilter: (next: KindFilter | ((current: KindFilter) => KindFilter)) => void;
  reset: () => void;
}

export type TraceStore = ReturnType<typeof createTraceStore>;

export function createTraceStore(initial: TraceState = initialTraceState) {
  return createStore<TraceStoreState>((set, get) => ({
    ...initial,
    hoveredNodeId: undefined as string | undefined,
    kindFilter: ALL_KIND_FILTER,
    apply: (event) => set(reduceTrace(get(), event)),
    select: (id) => set({ selectedNodeId: id }),
    hover: (id) => set({ hoveredNodeId: id }),
    setKindFilter: (next) =>
      set((state) => ({
        kindFilter: typeof next === "function" ? next(state.kindFilter) : next,
      })),
    reset: () =>
      set((state) => ({
        ...initialTraceState,
        hoveredNodeId: undefined,
        kindFilter: ALL_KIND_FILTER,
        apply: state.apply,
        select: state.select,
        hover: state.hover,
        setKindFilter: state.setKindFilter,
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
