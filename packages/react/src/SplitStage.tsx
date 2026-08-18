import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  PANE_LEFT_DEFAULT,
  PANE_MAX,
  PANE_MIN,
  PANE_RIGHT_DEFAULT,
  clampPaneWidth,
  widthFromDrag,
} from "./panes.js";

function clientXOf(event: PointerEvent<HTMLDivElement>): number {
  const x = event.nativeEvent?.clientX ?? event.clientX;
  return Number.isFinite(x) ? x : 0;
}

function PaneHandle({
  edge,
  width,
  onWidthChange,
}: {
  edge: "left" | "right";
  width: number;
  onWidthChange: (next: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const label = edge === "left" ? "Resize chat sidebar" : "Resize inspector sidebar";

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      if (!drag.current) return;
      onWidthChange(
        widthFromDrag(edge, drag.current.startX, drag.current.startWidth, event.clientX),
      );
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [edge, onWidthChange]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: clientXOf(event), startWidth: width };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* jsdom */
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onWidthChange(
      widthFromDrag(edge, drag.current.startX, drag.current.startWidth, clientXOf(event)),
    );
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 16;
    let delta = 0;
    if (event.key === "ArrowRight") delta = step;
    if (event.key === "ArrowLeft") delta = -step;
    if (!delta) return;
    event.preventDefault();
    onWidthChange(clampPaneWidth(width + (edge === "left" ? delta : -delta)));
  };

  return (
    <div
      className="atc-split-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={PANE_MIN}
      aria-valuemax={PANE_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}

export function SplitStage({
  chat,
  canvas,
  inspector,
}: {
  chat?: ReactNode;
  canvas: ReactNode;
  inspector?: ReactNode;
}) {
  const [leftWidth, setLeftWidth] = useState(PANE_LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(PANE_RIGHT_DEFAULT);
  const setLeft = useCallback((next: number) => setLeftWidth(next), []);
  const setRight = useCallback((next: number) => setRightWidth(next), []);

  return (
    <div
      className="atc-stage"
      data-chat={chat ? "" : undefined}
      data-inspector={inspector ? "" : undefined}
      style={
        {
          "--atc-chat-width": `${leftWidth}px`,
          "--atc-inspector-width": `${rightWidth}px`,
        } as CSSProperties
      }
    >
      {chat}
      {chat ? <PaneHandle edge="left" width={leftWidth} onWidthChange={setLeft} /> : null}
      {canvas}
      {inspector ? (
        <PaneHandle edge="right" width={rightWidth} onWidthChange={setRight} />
      ) : null}
      {inspector}
    </div>
  );
}
