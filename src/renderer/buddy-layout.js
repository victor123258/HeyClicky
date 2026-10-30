// Shared pure geometry for the isolated overlay and Node layout tests.
(function (root) {
  const sizes = Object.freeze({
    small: [28, 32],
    medium: [32, 36],
    large: [38, 42],
  });
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  function placeBuddy(
    bounds,
    point,
    size = "small",
    label = { width: 0, height: 0 },
    workArea = bounds,
  ) {
    const a = {
      x: workArea.x - bounds.x,
      y: workArea.y - bounds.y,
      width: workArea.width,
      height: workArea.height,
    };
    const margin = Math.min(6, Math.floor(Math.min(a.width, a.height) / 4));
    const [w, h] = sizes[size] || sizes.small;
    const factor = Math.min(
      1,
      Math.max(1, a.width - 2 * margin) / w,
      Math.max(1, a.height - 2 * margin) / h,
    );
    const width = w * factor,
      height = h * factor;
    const x = point.x - bounds.x,
      y = point.y - bounds.y;
    const left = clamp(
      x + 12 + width > a.x + a.width - margin ? x - 12 - width : x + 12,
      a.x + margin,
      a.x + a.width - margin - width,
    );
    const top = clamp(
      y + 12 + height > a.y + a.height - margin ? y - 12 - height : y + 12,
      a.y + margin,
      a.y + a.height - margin - height,
    );
    const lw = Math.min(label.width, Math.max(0, a.width - 2 * margin)),
      lh = Math.min(label.height, Math.max(0, a.height - 2 * margin));
    const labelLeft = clamp(
      left + width + 6 + lw > a.x + a.width - margin
        ? left - lw - 6
        : left + width + 6,
      a.x + margin,
      a.x + a.width - margin - lw,
    );
    const labelTop = clamp(top + 2, a.y + margin, a.y + a.height - margin - lh);
    return {
      left,
      top,
      width,
      height,
      labelLeft: labelLeft - left,
      labelTop: labelTop - top,
    };
  }
  const api = { sizes, placeBuddy };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.buddyLayout = api;
})(typeof window === "object" ? window : globalThis);
