import { useRef, type ReactNode } from "react";
import { findScrollTarget } from "./panes.js";

export function ChatPane({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="atc-chat" ref={rootRef}>
      {children}
      <button
        type="button"
        className="atc-latest"
        onClick={() => {
          const root = rootRef.current;
          if (!root) return;
          const target = findScrollTarget(root);
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
          target.scrollTo({ top: target.scrollHeight, behavior: reduce ? "auto" : "smooth" });
        }}
      >
        ↓ Latest
      </button>
    </div>
  );
}
