function notchBounds(display, mode = "collapsed") {
  if (typeof mode === "boolean") mode = mode ? "expanded" : "collapsed";
  const area = display.workArea || display.bounds;
  const sizes = {
    collapsed: [232, 40],
    peek: [432, 300],
    expanded: [704, 800],
  };
  const [w, h] = sizes[mode] || sizes.collapsed;
  const width = Math.min(w, area.width),
    height = Math.min(h, area.height);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: area.y,
    width,
    height,
  };
}
module.exports = { notchBounds };
