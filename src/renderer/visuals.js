import { validateVisual } from "../main/lib/visuals.js";
import example from "../shared/modeling-example.json";
import { visiblePartIds } from "../shared/scene-data.js";
import { createSceneRenderer } from "./scene3d.mjs";
let active = null;
let dispose = () => {},
  capture = () => null;
function render(host, spec, options = {}) {
  dispose();
  capture = () => null;
  host.replaceChildren();
  const step = spec.steps?.[options.step ?? 0],
    highlight = new Set(step?.highlight || []),
    visible = (id) => !step?.visible || step.visible.includes(id),
    emphasis = (id) => !highlight.size || highlight.has(id);
  if (spec.kind !== "scene3d") {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 600;
    canvas.style.width = "100%";
    canvas.style.height = options.desktop ? "100%" : "auto";
    canvas.style.objectFit = "contain";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", spec.title);
    host.append(canvas);
    const c = canvas.getContext("2d");
    if (!options.transparent) {
      c.fillStyle = "#141e2c";
      c.fillRect(0, 0, 1000, 600);
    } else {
      c.shadowColor = "#000";
      c.shadowBlur = 5;
    }
    const style = (id, color = "#c4d1e6") => {
      c.globalAlpha = emphasis(id) ? 1 : 0.3;
      c.fillStyle = color;
      c.strokeStyle = color;
      c.lineWidth = highlight.has(id) ? 5 : 2;
    };
    const arrow = (x, y, x2, y2) => {
      const a = Math.atan2(y2 - y, x2 - x);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x2, y2);
      c.moveTo(x2 - 16 * Math.cos(a - 0.4), y2 - 16 * Math.sin(a - 0.4));
      c.lineTo(x2, y2);
      c.lineTo(x2 - 16 * Math.cos(a + 0.4), y2 - 16 * Math.sin(a + 0.4));
      c.stroke();
    };
    if (spec.kind === "chart") {
      const max = Math.max(...spec.items.map((i) => Math.abs(i.value)), 1),
        h = 520 / spec.items.length;
      c.font = "20px Segoe UI";
      spec.items.forEach((item, i) => {
        if (!visible(item.id)) return;
        const y = 28 + i * h;
        style(item.id);
        c.textAlign = "left";
        c.fillText(item.label.slice(0, 25), 18, y + 20);
        const w = (Math.abs(item.value) / max) * 250;
        style(item.id, item.value < 0 ? "#f0a2b1" : "#b4d9ee");
        c.fillRect(650 + (item.value < 0 ? -w : 0), y, w, Math.max(4, h - 12));
        c.fillStyle = "#f5f7ff";
        c.textAlign = "right";
        c.fillText(String(item.value), 990, y + 20);
      });
      c.globalAlpha = 1;
      c.strokeStyle = "#bac6d8";
      c.beginPath();
      c.moveTo(650, 15);
      c.lineTo(650, 570);
      c.stroke();
    } else if (spec.kind === "diagram") {
      const point = (n) => ({
        x: 90 + (n.x / 1000) * 820,
        y: 50 + (n.y / 1000) * 500,
      });
      c.font = "20px Segoe UI";
      for (const e of spec.edges) {
        if (!visible(e.from) || !visible(e.to)) continue;
        const a = point(spec.nodes.find((n) => n.id === e.from)),
          b = point(spec.nodes.find((n) => n.id === e.to));
        style(e.from, "#bccfe9");
        arrow(a.x, a.y, b.x, b.y);
        c.fillStyle = "#e5d5ff";
        c.fillText(e.label.slice(0, 30), (a.x + b.x) / 2, (a.y + b.y) / 2 - 12);
      }
      for (const n of spec.nodes) {
        if (!visible(n.id)) continue;
        const p = point(n);
        style(n.id, "#cab5ff");
        if (!options.transparent) {
          c.fillStyle = "#2a3c56";
          c.fillRect(p.x - 82, p.y - 23, 164, 46);
        }
        c.strokeRect(p.x - 82, p.y - 23, 164, 46);
        c.fillStyle = "#f1f5ff";
        c.textAlign = "center";
        c.fillText(n.label.slice(0, 17), p.x, p.y + 7);
        c.textAlign = "left";
      }
    } else {
      for (const e of spec.elements) {
        if (!visible(e.id)) continue;
        style(e.id, e.color);
        const x = e.x,
          y = e.y * 0.6,
          x2 = e.x2,
          y2 = e.y2 * 0.6;
        if (e.type === "box") {
          if (e.fill !== "none") {
            c.fillStyle = e.fill;
            c.globalAlpha *= 0.25;
            c.fillRect(
              Math.min(x, x2),
              Math.min(y, y2),
              Math.abs(x2 - x),
              Math.abs(y2 - y),
            );
            style(e.id, e.color);
          }
          c.strokeRect(
            Math.min(x, x2),
            Math.min(y, y2),
            Math.abs(x2 - x),
            Math.abs(y2 - y),
          );
        }
        if (e.type === "ellipse") {
          c.beginPath();
          c.ellipse(
            (x + x2) / 2,
            (y + y2) / 2,
            Math.max(1, Math.abs(x2 - x) / 2),
            Math.max(1, Math.abs(y2 - y) / 2),
            0,
            0,
            Math.PI * 2,
          );
          if (e.fill !== "none") {
            c.fillStyle = e.fill;
            c.globalAlpha *= 0.25;
            c.fill();
            style(e.id, e.color);
          }
          c.stroke();
        }
        if (e.type === "arrow") arrow(x, y, x2, y2);
        if (e.type === "path") {
          c.beginPath();
          e.points.forEach((p, i) =>
            i ? c.lineTo(p[0], p[1] * 0.6) : c.moveTo(p[0], p[1] * 0.6),
          );
          c.stroke();
        }
        if (e.label) {
          c.font = `${e.fontSize}px Segoe UI`;
          c.fillStyle = e.color;
          const width = Math.max(
            80,
            Math.min(1000 - x, e.x2 > x ? e.x2 - x : 320),
          );
          let line = "",
            row = 0;
          for (const word of e.label.split(/\s+/)) {
            if (c.measureText(line + word).width > width && line) {
              c.fillText(line, x, y + row * e.fontSize * 1.3);
              line = "";
              row++;
              if (row >= 10) break;
            }
            line += word + " ";
          }
          if (row < 10) c.fillText(line, x, y + row * e.fontSize * 1.3);
        }
      }
    }
    dispose = () => {};
    return;
  }
  active = createSceneRenderer(host, spec, options);
  dispose = () => {
    active?.dispose();
    active = null;
  };
  capture = () => active?.capture() ?? null;
}

window.visuals = {
  modelingExample: {
    id: "modeling-preview",
    spec: validateVisual(JSON.stringify(example)),
  },
  visiblePartIds,
  render,
  setSelection: (id) => active?.setSelection(id),
  setInteractive: (value) => active?.setInteractive(value),
  focus: (id) => active?.focus(id),
  capture: () => capture(),
  clear: () => {
    dispose();
    dispose = () => {};
    capture = () => null;
  },
};
