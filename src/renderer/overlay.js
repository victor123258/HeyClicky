const svg = document.querySelector("#annotations"),
  buddy = document.querySelector("#buddy"),
  label = document.querySelector("#buddy-label");
let bounds = { x: 0, y: 0, width: 1, height: 1 },
  enabled = true,
  pointer = null,
  expiry;
const cards = document.querySelector("#explanation-cards"),
  caption = document.querySelector("#caption");
let captionTimer,
  lastCursor = null,
  buddySize = "small",
  workArea = null;
const ns = "http://www.w3.org/2000/svg";
function node(name, attrs) {
  const el = document.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
function move(p, immediate = false) {
  buddy.hidden =
    !enabled ||
    !p ||
    p.x < bounds.x ||
    p.y < bounds.y ||
    p.x >= bounds.x + bounds.width ||
    p.y >= bounds.y + bounds.height;
  if (buddy.hidden) return;
  const area = workArea || bounds;
  label.style.maxWidth = `${Math.max(1, Math.min(160, area.width - 12))}px`;
  label.style.maxHeight = `${Math.max(1, area.height - 12)}px`;
  if (immediate) buddy.style.transition = "none";
  const layout = window.buddyLayout.placeBuddy(
    bounds,
    p,
    buddySize,
    { width: label.offsetWidth, height: label.offsetHeight },
    workArea || bounds,
  );
  for (const key of ["left", "top", "width", "height"])
    buddy.style[key] = `${layout[key]}px`;
  label.style.left = `${layout.labelLeft}px`;
  label.style.top = `${layout.labelTop}px`;
  if (immediate) {
    void buddy.offsetWidth;
    buddy.style.removeProperty("transition");
  }
}

window.overlay.onEvent(({ type, data }) => {
  if (type === "init") {
    bounds = data.bounds;
    workArea = data.workArea || bounds;
    enabled = data.buddy;
    buddySize = data.buddySize || "small";
    move(pointer || lastCursor);
  }
  if (type === "buddy") {
    enabled = data;
    move(pointer || lastCursor);
  }
  if (type === "buddy-size") {
    buddySize = data;
    move(pointer || lastCursor, true);
  }
  if (type === "cursor") {
    lastCursor = data;
    if (!pointer) move(data);
  }
  if (type === "state") {
    const colors = {
      listening: "#f0bf7b",
      thinking: "#a9a2ee",
      speaking: "#9fd5be",
      dictating: "#8bc9df",
      working: "#efaaa3",
      approval: "#e4bc7d",
    };
    buddy.style.setProperty("--color", colors[data] || "#b7a2ee");
    label.textContent = data === "idle" ? "" : data;
    move(pointer || lastCursor);
  }
  if (type === "caption") {
    clearTimeout(captionTimer);
    caption.hidden =
      !data || data.bounds.x !== bounds.x || data.bounds.y !== bounds.y;
    if (data && !caption.hidden) {
      document.querySelector("#caption-text").textContent = data.text;
      captionTimer = setTimeout(() => (caption.hidden = true), 25000);
    }
  }
  if (type === "clear") {
    cards.replaceChildren();
    svg.replaceChildren();
    pointer = null;
    move(lastCursor);
    clearTimeout(expiry);
  }
  if (type === "draw") {
    svg.replaceChildren();
    cards.replaceChildren();
    pointer = null;
    let number = 0;
    for (const a of data) {
      if (a.bounds.x !== bounds.x || a.bounds.y !== bounds.y) continue;
      const x = (a.x / 1000) * bounds.width,
        y = (a.y / 1000) * bounds.height,
        x2 = (a.x2 / 1000) * bounds.width,
        y2 = (a.y2 / 1000) * bounds.height;
      const style = {
        stroke: "#a47be6",
        "stroke-width": 3,
        fill: "none",
        "stroke-linecap": "round",
      };
      if (a.shape === "box")
        svg.append(
          node("rect", {
            x: Math.min(x, x2),
            y: Math.min(y, y2),
            width: Math.abs(x2 - x),
            height: Math.abs(y2 - y),
            rx: 7,
            ...style,
          }),
        );
      if (a.shape === "circle")
        svg.append(
          node("ellipse", {
            cx: (x + x2) / 2,
            cy: (y + y2) / 2,
            rx: Math.max(5, Math.abs(x2 - x) / 2),
            ry: Math.max(5, Math.abs(y2 - y) / 2),
            ...style,
          }),
        );
      if (a.shape === "arrow") {
        const angle = Math.atan2(y2 - y, x2 - x),
          len = 14;
        svg.append(
          node("path", {
            d: `M${x} ${y}L${x2} ${y2}M${x2 - len * Math.cos(angle - 0.5)} ${y2 - len * Math.sin(angle - 0.5)}L${x2} ${y2}L${x2 - len * Math.cos(angle + 0.5)} ${y2 - len * Math.sin(angle + 0.5)}`,
            ...style,
          }),
        );
      }
      if (a.shape === "pointer")
        svg.append(node("circle", { cx: x, cy: y, r: 12, ...style }));
      if (a.label) {
        const card = document.createElement("div");
        card.className = "explanation-card";
        card.style.left = `${Math.max(8, Math.min(x + 20, bounds.width - 250))}px`;
        card.style.top = `${Math.max(8, Math.min(y + 20, bounds.height - 100))}px`;
        const badge = document.createElement("b");
        badge.textContent = String(++number);
        const text = document.createElement("span");
        text.textContent = a.label.slice(0, 150);
        card.append(badge, text);
        cards.append(card);
      }
      pointer = { x: x + bounds.x, y: y + bounds.y };
      move(pointer);
    }
    clearTimeout(expiry);
    expiry = setTimeout(() => {
      svg.replaceChildren();
      cards.replaceChildren();
      pointer = null;
      move(lastCursor);
    }, 16000);
  }
});
