export function CanvasZoomControls({
  onZoomIn,
  onZoomOut,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="atc-zoom" role="group" aria-label="Canvas zoom">
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
        −
      </button>
    </div>
  );
}
