function notchBounds(display, mode = "collapsed") {
  if (typeof mode === "boolean") mode = mode ? "expanded" : "collapsed";
  const area = display.workArea || display.bounds;
  const sizes = {
    collapsed: [232, 40],
    peek: [432, 300],
    expanded: [
      704,
      Math.min(
        760,
        area.height < 360 ? area.height : Math.floor(area.height * 0.88),
      ),
    ],
  };
  const [w, h] = sizes[mode] || sizes.collapsed;
  const width = Math.min(
      w,
      mode === "expanded" && area.width >= 360 ? area.width - 24 : area.width,
    ),
    height = Math.min(h, area.height);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: area.y,
    width,
    height,
  };
}
module.exports = { notchBounds };
