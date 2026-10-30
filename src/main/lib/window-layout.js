// Electron bounds are logical pixels (DIP). Do not multiply by display.scaleFactor.
function panelLayout(display, current) {
  const a = display.workArea || display.bounds;
  const margin = Math.min(16, Math.floor(Math.min(a.width, a.height) / 20));
  const availableWidth = Math.max(1, a.width - margin * 2);
  const availableHeight = Math.max(1, a.height - margin * 2);
  const width = Math.min(current?.width || 980, availableWidth);
  const height = Math.min(current?.height || 720, availableHeight);
  const minWidth = Math.min(640, availableWidth);
  const minHeight = Math.min(480, availableHeight);
  const w = Math.max(minWidth, width),
    h = Math.max(minHeight, height);
  return {
    x: Math.round(
      Math.max(
        a.x + margin,
        Math.min(
          current?.x ?? a.x + (a.width - w) / 2,
          a.x + a.width - margin - w,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        a.y + margin,
        Math.min(
          current?.y ?? a.y + (a.height - h) / 2,
          a.y + a.height - margin - h,
        ),
      ),
    ),
    width: w,
    height: h,
    minWidth,
    minHeight,
  };
}
module.exports = { panelLayout };
