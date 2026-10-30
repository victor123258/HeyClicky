function validateVisual(raw) {
  if (typeof raw !== "string" || raw.length > 20000)
    throw Error("Visual specification limit is 20,000 characters.");
  const s = JSON.parse(raw);
  const finite = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const label = (v) => typeof v === "string" && v.length <= 160;
  if (
    !s ||
    !label(s.title) ||
    typeof s.caption !== "string" ||
    s.caption.length > 2000
  )
    throw Error("Visual needs title (160 max) and caption (2000 max).");
  if (s.kind === "chart") {
    if (
      !Array.isArray(s.items) ||
      !s.items.length ||
      s.items.length > 20 ||
      !s.items.every((i) => label(i.label) && finite(i.value, -1e6, 1e6))
    )
      throw Error("Chart requires 1–20 label/value items.");
    return {
      kind: s.kind,
      title: s.title,
      caption: s.caption,
      items: s.items.map(({ label, value }) => ({ label, value })),
    };
  }
  if (s.kind === "diagram") {
    if (
      !Array.isArray(s.nodes) ||
      !s.nodes.length ||
      s.nodes.length > 20 ||
      !s.nodes.every(
        (n) =>
          label(n.id) &&
          n.id &&
          label(n.label) &&
          finite(n.x, 0, 1000) &&
          finite(n.y, 0, 1000),
      )
    )
      throw Error(
        "Diagram requires 1–20 id/label/x/y nodes (0–1000 coordinates).",
      );
    const ids = new Set(s.nodes.map((n) => n.id));
    if (
      ids.size !== s.nodes.length ||
      !Array.isArray(s.edges) ||
      s.edges.length > 40 ||
      !s.edges.every((e) => ids.has(e.from) && ids.has(e.to) && label(e.label))
    )
      throw Error("Diagram edges must reference unique existing nodes.");
    return {
      kind: s.kind,
      title: s.title,
      caption: s.caption,
      nodes: s.nodes.map(({ id, label, x, y }) => ({ id, label, x, y })),
      edges: s.edges.map(({ from, to, label }) => ({ from, to, label })),
    };
  }
  if (s.kind === "scene3d") {
    if (
      !Array.isArray(s.objects) ||
      !s.objects.length ||
      s.objects.length > 24 ||
      !s.objects.every(
        (o) =>
          ["box", "sphere", "cylinder", "cone"].includes(o.type) &&
          label(o.label) &&
          /^#[\da-f]{6}$/i.test(o.color) &&
          [o.x, o.y, o.z].every((v) => finite(v, -10, 10)) &&
          finite(o.size, 0.1, 5),
      )
    )
      throw Error(
        "3D requires 1–24 box/sphere/cylinder/cone objects with label, #RRGGBB color, x/y/z (-10..10) and size (0.1..5).",
      );
    return {
      kind: s.kind,
      title: s.title,
      caption: s.caption,
      objects: s.objects.map(({ type, label, color, x, y, z, size }) => ({
        type,
        label,
        color,
        x,
        y,
        z,
        size,
      })),
    };
  }
  throw Error(
    "Visual kind must be chart, diagram or scene3d. No HTML, code, remote assets or arbitrary model files are accepted.",
  );
}
module.exports = { validateVisual };
