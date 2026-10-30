// Model output is data, never HTML, scripts, shaders or remote assets.
const finite = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const text = (v, max = 160) =>
  typeof v === "string" && v.length <= max && !v.includes("\0");
const identifier = (v) =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(v);
const color = (v) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
const vector = (v, min, max) =>
  Array.isArray(v) && v.length === 3 && v.every((x) => finite(x, min, max));
function check(condition, message) {
  if (!condition) throw Error(message);
}
function validateVisual(raw) {
  check(
    typeof raw === "string" && raw.length <= 60000,
    "Visual specification limit is 60,000 characters.",
  );
  const s = JSON.parse(raw);
  check(
    s && text(s.title) && text(s.caption, 2000),
    "Visual needs title (160 max) and caption (2000 max).",
  );
  const out = { kind: s.kind, title: s.title, caption: s.caption };
  let ids = [];
  if (s.kind === "chart") {
    check(
      Array.isArray(s.items) && s.items.length > 0 && s.items.length <= 20,
      "Chart requires 1–20 label/value items.",
    );
    out.items = s.items.map((i, n) => {
      check(
        i && text(i.label) && finite(i.value, -1e6, 1e6),
        "Invalid chart item.",
      );
      return { id: i.id ?? `item${n + 1}`, label: i.label, value: i.value };
    });
    ids = out.items.map((i) => i.id);
  } else if (s.kind === "diagram") {
    check(
      Array.isArray(s.nodes) && s.nodes.length > 0 && s.nodes.length <= 20,
      "Diagram requires 1–20 nodes.",
    );
    out.nodes = s.nodes.map((n) => {
      check(
        n && text(n.label) && finite(n.x, 0, 1000) && finite(n.y, 0, 1000),
        "Diagram coordinates must be 0–1000.",
      );
      return { id: n.id, label: n.label, x: n.x, y: n.y };
    });
    ids = out.nodes.map((n) => n.id);
    check(
      Array.isArray(s.edges) &&
        s.edges.length <= 40 &&
        s.edges.every(
          (e) =>
            e && ids.includes(e.from) && ids.includes(e.to) && text(e.label),
        ),
      "Diagram edges must reference existing nodes.",
    );
    out.edges = s.edges.map(({ from, to, label }) => ({ from, to, label }));
  } else if (s.kind === "canvas2d") {
    check(
      Array.isArray(s.elements) &&
        s.elements.length > 0 &&
        s.elements.length <= 80,
      "2D canvas requires 1–80 elements.",
    );
    out.elements = s.elements.map((e, n) => {
      check(
        e &&
          ["box", "ellipse", "arrow", "path", "text"].includes(e.type) &&
          text(e.label ?? "", 800),
        "Invalid 2D element.",
      );
      const v = {
        id: e.id ?? `element${n + 1}`,
        type: e.type,
        label: e.label ?? "",
        color: e.color ?? "#c8b4ff",
        fill: e.fill ?? "none",
        x: e.x ?? 0,
        y: e.y ?? 0,
        x2: e.x2 ?? e.x ?? 0,
        y2: e.y2 ?? e.y ?? 0,
        fontSize: e.fontSize ?? 24,
      };
      check(
        color(v.color) &&
          (v.fill === "none" || color(v.fill)) &&
          [v.x, v.y, v.x2, v.y2].every((x) => finite(x, 0, 1000)) &&
          finite(v.fontSize, 12, 48),
        "Invalid 2D coordinates/color/font size.",
      );
      if (e.type === "path") {
        check(
          Array.isArray(e.points) &&
            e.points.length >= 2 &&
            e.points.length <= 128 &&
            e.points.every(
              (p) =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every((x) => finite(x, 0, 1000)),
            ),
          "Path requires 2–128 bounded 2D points.",
        );
        v.points = e.points.map((p) => [...p]);
      }
      return v;
    });
    ids = out.elements.map((e) => e.id);
  } else if (s.kind === "scene3d") {
    check(
      Array.isArray(s.objects) &&
        s.objects.length > 0 &&
        s.objects.length <= 40,
      "3D requires 1–40 bounded objects.",
    );
    let vertices = 0,
      faces = 0,
      motions = 0;
    out.objects = s.objects.map((o, n) => {
      check(
        o &&
          [
            "box",
            "sphere",
            "cylinder",
            "cone",
            "torus",
            "plane",
            "arrow",
            "line",
            "label",
            "mesh",
          ].includes(o.type) &&
          text(o.label ?? "") &&
          color(o.color) &&
          [o.x, o.y, o.z].every((v) => finite(v, -20, 20)) &&
          finite(o.size, 0.1, 5),
        "Invalid 3D object: use bounded position/size and #RRGGBB color.",
      );
      const v = {
        id: o.id ?? `object${n + 1}`,
        type: o.type,
        label: o.label ?? "",
        color: o.color,
        x: o.x,
        y: o.y,
        z: o.z,
        size: o.size,
        rotation: o.rotation ?? [0, 0, 0],
        scale: o.scale ?? [1, 1, 1],
        opacity: o.opacity ?? 1,
        wireframe: o.wireframe ?? false,
      };
      check(
        vector(v.rotation, -360, 360) &&
          vector(v.scale, 0.01, 10) &&
          finite(v.opacity, 0.1, 1) &&
          typeof v.wireframe === "boolean",
        "Invalid transform or material.",
      );
      if (o.motion !== undefined) {
        const m = o.motion;
        check(
          m &&
            ["rotate", "pulse"].includes(m.mode) &&
            ["x", "y", "z"].includes(m.axis) &&
            finite(m.speed, -1, 1) &&
            m.speed !== 0,
          "Motion needs rotate/pulse, x/y/z axis and nonzero speed -1..1.",
        );
        v.motion = { mode: m.mode, axis: m.axis, speed: m.speed };
        motions++;
      }
      if (o.type === "arrow") {
        check(vector(o.to, -20, 20), "Arrow needs a bounded to:[x,y,z].");
        v.to = [...o.to];
      }
      if (o.type === "line") {
        check(
          Array.isArray(o.points) &&
            o.points.length >= 2 &&
            o.points.length <= 128 &&
            o.points.every((p) => vector(p, -5, 5)),
          "Line requires 2–128 local 3D points.",
        );
        v.points = o.points.map((p) => [...p]);
      }
      if (o.type === "mesh") {
        check(
          Array.isArray(o.vertices) &&
            o.vertices.length >= 3 &&
            o.vertices.length <= 256 &&
            o.vertices.every((p) => vector(p, -5, 5)),
          "Mesh requires 3–256 bounded local vertices.",
        );
        check(
          Array.isArray(o.faces) &&
            o.faces.length >= 1 &&
            o.faces.length <= 512 &&
            o.faces.every(
              (f) =>
                Array.isArray(f) &&
                f.length === 3 &&
                f.every(
                  (i) => Number.isInteger(i) && i >= 0 && i < o.vertices.length,
                ),
            ),
          "Mesh requires valid triangle indices (512 max).",
        );
        vertices += o.vertices.length;
        faces += o.faces.length;
        v.vertices = o.vertices.map((p) => [...p]);
        v.faces = o.faces.map((p) => [...p]);
      }
      return v;
    });
    check(motions <= 8, "At most eight animated objects per scene.");
    check(vertices <= 4096 && faces <= 8192, "Scene geometry budget exceeded.");
    ids = out.objects.map((o) => o.id);
  } else
    throw Error(
      "Visual kind must be chart, diagram, canvas2d or scene3d. No executable content or remote assets.",
    );
  check(
    ids.every(identifier) && new Set(ids).size === ids.length,
    "Visual IDs must be unique, 1–48 letters/digits/underscores/hyphens.",
  );
  if (s.steps !== undefined) {
    check(
      Array.isArray(s.steps) && s.steps.length <= 12,
      "A visual supports at most 12 teaching steps.",
    );
    out.steps = s.steps.map((step) => {
      check(
        step && text(step.title) && text(step.narration, 1500),
        "Step needs a title and narration (1500 max).",
      );
      const highlight = step.highlight ?? [];
      check(
        Array.isArray(highlight) &&
          highlight.length <= 80 &&
          highlight.every((id) => ids.includes(id)),
        "Step highlights must reference existing IDs.",
      );
      const result = {
        title: step.title,
        narration: step.narration,
        highlight: [...new Set(highlight)],
      };
      if (step.visible !== undefined) {
        check(
          Array.isArray(step.visible) &&
            step.visible.length <= 80 &&
            step.visible.every((id) => ids.includes(id)),
          "Step visibility must reference existing IDs.",
        );
        result.visible = [...new Set(step.visible)];
      }
      return result;
    });
  }
  if (s.placement !== undefined) {
    check(
      ["left", "center", "right"].includes(s.placement),
      "Placement must be left, center or right.",
    );
    out.placement = s.placement;
  }
  return out;
}
function applyVisualPatch(current, raw) {
  check(current, "No visual to update. Create one with show_visual first.");
  check(
    typeof raw === "string" && raw.length <= 30000,
    "Visual patch limit is 30,000 characters.",
  );
  const p = JSON.parse(raw);
  check(
    p &&
      typeof p === "object" &&
      !Array.isArray(p) &&
      Object.keys(p).length > 0 &&
      Object.keys(p).every((k) =>
        [
          "title",
          "caption",
          "objects",
          "remove",
          "items",
          "nodes",
          "edges",
          "elements",
          "steps",
          "placement",
        ].includes(k),
      ),
    "Unknown or empty visual patch.",
  );
  for (const key of ["items", "nodes", "edges", "elements"])
    if (Object.hasOwn(p, key))
      check(
        (current.kind === "chart" && key === "items") ||
          (current.kind === "diagram" && ["nodes", "edges"].includes(key)) ||
          (current.kind === "canvas2d" && key === "elements"),
        "Array patch does not apply to this visual kind.",
      );
  const next = structuredClone(current);
  for (const key of [
    "title",
    "caption",
    "items",
    "nodes",
    "edges",
    "elements",
    "steps",
    "placement",
  ])
    if (Object.hasOwn(p, key)) next[key] = p[key];
  if (p.objects !== undefined || p.remove !== undefined) {
    check(
      current.kind === "scene3d",
      "Object patches only apply to 3D scenes.",
    );
    check(
      p.remove === undefined ||
        (Array.isArray(p.remove) &&
          p.remove.every(
            (id) => identifier(id) && current.objects.some((o) => o.id === id),
          )),
      "Remove requires existing object IDs.",
    );
    next.objects = next.objects.filter((o) => !p.remove?.includes(o.id));
    if (p.objects !== undefined) {
      check(
        Array.isArray(p.objects) &&
          p.objects.length <= 40 &&
          p.objects.every((o) => o && identifier(o.id)) &&
          new Set(p.objects.map((o) => o.id)).size === p.objects.length,
        "Object updates need unique explicit IDs.",
      );
      for (const change of p.objects) {
        check(
          Object.keys(change).every((k) =>
            [
              "id",
              "type",
              "label",
              "color",
              "x",
              "y",
              "z",
              "size",
              "rotation",
              "scale",
              "opacity",
              "wireframe",
              "to",
              "points",
              "vertices",
              "faces",
              "motion",
            ].includes(k),
          ),
          "Unknown object patch field.",
        );
        const i = next.objects.findIndex((o) => o.id === change.id);
        if (i < 0) next.objects.push(change);
        else {
          next.objects[i] = { ...next.objects[i], ...change };
          if (change.motion === null) delete next.objects[i].motion;
        }
      }
    }
  }
  return validateVisual(JSON.stringify(next));
}
function visualContext(spec) {
  if (!spec) return null;
  const s = structuredClone(spec);
  s.caption = s.caption.slice(0, 400);
  if (s.objects)
    for (const o of s.objects) {
      o.label = o.label.slice(0, 64);
      if (o.vertices) {
        o.vertexCount = o.vertices.length;
        delete o.vertices;
      }
      if (o.faces) {
        o.faceCount = o.faces.length;
        delete o.faces;
      }
      if (o.points) {
        o.pointCount = o.points.length;
        delete o.points;
      }
    }
  if (s.elements)
    for (const e of s.elements) {
      e.label = e.label.slice(0, 64);
      if (e.points) {
        e.pointCount = e.points.length;
        delete e.points;
      }
    }
  if (s.steps)
    s.steps = s.steps.map(({ title, narration }) => ({
      title: title.slice(0, 80),
      narration: narration.slice(0, 120),
    }));
  if (JSON.stringify(s).length > 18000) {
    for (const arr of [s.objects, s.elements])
      if (arr) for (const item of arr) delete item.label;
  }

  return s;
}
module.exports = { validateVisual, applyVisualPatch, visualContext };
