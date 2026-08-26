export function CanvasZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="atc-zoom" role="group" aria-label="Canvas zoom">
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
        −
      </button>
      <button type="button" aria-label="Fit to view" onClick={onFit}>
        <span className="atc-zoom-fit">Fit</span>
      </button>
    </div>
  );
}
