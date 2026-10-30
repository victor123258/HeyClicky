function notchBounds(display, expanded) {
  const area = display.workArea || display.bounds;
  const width = Math.min(expanded ? 408 : 228, area.width);
  const height = Math.min(expanded ? 216 : 44, area.height);
  return { x: Math.round(area.x + (area.width - width) / 2), y: area.y, width, height };
}
module.exports = { notchBounds };
