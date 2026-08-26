import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export function PhosphorEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const spotlight = (data?.spotlight as string) ?? "idle";
  const running = Boolean(data?.running);
  const showBeam = running || spotlight === "related";

  return (
    <>
      <path d={path} className="atc-edge-hit" />
      <BaseEdge id={id} path={path} className={`atc-edge is-${spotlight}${running ? " is-running" : ""}`} />
      {showBeam ? <path d={path} className="react-flow__edge-path atc-edge-beam" /> : null}
    </>
  );
}
