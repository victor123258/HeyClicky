// All modeling is bounded data. No code, URLs, expressions, plugins or shaders.
const ok = (v, m) => {
  if (!v) throw Error(m);
};
const finite = (v, a, b) =>
  typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
const vec = (v, a, b) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, a, b));
const id = (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(v);
const color = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
function geometryFields(o) {
  const out = {};
  if (o.parent !== undefined) {
    ok(id(o.parent), "Invalid parent ID.");
    out.parent = o.parent;
  }
  if (o.pivot !== undefined) {
    ok(vec(o.pivot, -5, 5), "Pivot must be a local vector -5..5.");
    out.pivot = [...o.pivot];
  }
  if (o.labelOffset !== undefined) {
    ok(vec(o.labelOffset, -5, 5), "Label offset must be -5..5.");
    out.labelOffset = [...o.labelOffset];
  }
  if (o.description !== undefined) {
    ok(
      typeof o.description === "string" &&
        o.description.length <= 800 &&
        !o.description.includes("\0"),
      "Part description limit is 800 characters.",
    );
    out.description = o.description;
  }
  if (o.material !== undefined) {
    const m = o.material;
    ok(m && typeof m === "object" && !Array.isArray(m), "Invalid material.");
    const r = {};
    for (const k of [
      "roughness",
      "metalness",
      "clearcoat",
      "emissiveIntensity",
    ])
      if (m[k] !== undefined) {
        ok(finite(m[k], 0, 1), "Material values must be 0..1.");
        r[k] = m[k];
      }
    if (m.emissive !== undefined) {
      ok(color(m.emissive), "Emissive must be #RRGGBB.");
      r.emissive = m.emissive;
    }
    out.material = r;
  }
  if (["extrude", "lathe"].includes(o.type)) {
    ok(
      Array.isArray(o.profile) &&
        o.profile.length >= (o.type === "extrude" ? 3 : 2) &&
        o.profile.length <= 32 &&
        o.profile.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((n) => finite(n, -5, 5)),
        ),
      "Profile requires 3–32 polygon points or 2–32 lathe points, -5..5.",
    );
    out.profile = o.profile.map((p) => [...p]);
    if (o.type === "lathe") {
      ok(
        o.profile
          .slice(1)
          .every(
            (p, i) =>
              Math.hypot(p[0] - o.profile[i][0], p[1] - o.profile[i][1]) > 1e-5,
          ),
        "Lathe profile segments must not collapse.",
      );
      ok(
        o.profile.every((p) => p[0] >= 0) && o.profile.some((p) => p[0] > 0.01),
        "Lathe radius must be nonnegative and not all zero.",
      );
    } else {
      let area = 0;
      const p = o.profile,
        n = p.length;
      const cross = (a, b, c) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (let i = 0; i < n; i++) {
        const a = p[i],
          b = p[(i + 1) % n];
        ok(
          Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-5,
          "Polygon edges must not collapse.",
        );
        area += a[0] * b[1] - b[0] * a[1];
        for (let j = i + 2; j < n; j++) {
          if ((j + 1) % n === i) continue;
          const c = p[j],
            d = p[(j + 1) % n];
          ok(
            !(
              cross(a, b, c) * cross(a, b, d) <= 0 &&
              cross(c, d, a) * cross(c, d, b) <= 0 &&
              Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
                Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
              Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
                Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
            ),
            "Polygon must be simple (no crossing/touching nonadjacent edges).",
          );
        }
      }
      ok(Math.abs(area) > 0.0001, "Polygon must enclose area.");
      ok(finite(o.depth, 0.05, 5), "Extrusion depth must be .05..5.");
      out.depth = o.depth;
      if (o.bevel !== undefined) {
        ok(
          finite(o.bevel, 0, 0.2) && o.bevel <= o.depth / 2,
          "Bevel must be 0..min(.2,depth/2).",
        );
        out.bevel = o.bevel;
      }
    }
  }
  if (o.type === "tube") {
    ok(
      Array.isArray(o.points) &&
        o.points.length >= 2 &&
        o.points.length <= 32 &&
        o.points.every((p) => vec(p, -5, 5)),
      "Tube requires 2–32 local points, -5..5.",
    );
    ok(
      o.points
        .slice(1)
        .every(
          (p, i) => Math.hypot(...p.map((v, k) => v - o.points[i][k])) > 1e-4,
        ),
      "Tube points must not repeat consecutively.",
    );
    ok(finite(o.radius, 0.02, 2), "Tube radius must be .02..2.");
    out.points = o.points.map((p) => [...p]);
    out.radius = o.radius;
  }
  if (["tube", "lathe"].includes(o.type)) {
    ok(
      o.segments === undefined ||
        (Number.isInteger(o.segments) && o.segments >= 8 && o.segments <= 64),
      "Curve segments must be integer 8..64.",
    );
    out.segments = o.segments ?? 32;
  }
  return out;
}
function validateHierarchy(objects) {
  const map = new Map(objects.map((o) => [o.id, o]));
  for (const o of objects) {
    let p = o,
      seen = new Set(),
      chain = [];
    while (p) {
      ok(
        !seen.has(p.id) && seen.size < 8,
        "Hierarchy must be acyclic and at most eight levels deep.",
      );
      seen.add(p.id);
      chain.unshift(p);
      if (p.parent) {
        ok(
          map.has(p.parent) && map.get(p.parent).type === "group",
          "Parent must reference an existing group.",
        );
        p = map.get(p.parent);
      } else p = null;
    }
    let scale = 1,
      extent = 0;
    for (const p of chain) {
      extent +=
        (Math.hypot(p.x, p.y, p.z) +
          2 * Math.hypot(...(p.pivot || [0, 0, 0]))) *
        scale;
      scale *= Math.max(...p.scale);
      ok(
        scale <= 50 && extent + 12 * scale <= 1000,
        "Hierarchy transform budget exceeded.",
      );
    }
  }

  let triangles = 0;
  for (const o of objects) {
    triangles +=
      o.type === "tube"
        ? o.segments * 12 * 2
        : o.type === "lathe"
          ? o.segments * (o.profile.length - 1) * 2
          : o.type === "extrude"
            ? o.profile.length * 20
            : o.type === "group" ||
                o.type === "label" ||
                o.type === "line" ||
                o.type === "arrow" ||
                o.type === "mesh"
              ? 0
              : 800;
  }
  ok(
    triangles <= 60000,
    "Procedural geometry budget exceeded (60,000 estimated triangles).",
  );
}
function expandAssemblies(s, validate) {
  const templates = [];
  ok(
    s.assemblies === undefined ||
      (Array.isArray(s.assemblies) && s.assemblies.length <= 6),
    "At most six reusable assemblies.",
  );
  for (const t of s.assemblies || []) {
    ok(
      t &&
        id(t.id) &&
        !templates.some((v) => v.id === t.id) &&
        Array.isArray(t.parts) &&
        t.parts.length > 0 &&
        t.parts.length <= 16 &&
        !t.parts.some((o) => o?.type === "assembly"),
      "Assembly needs a unique ID and 1–16 non-instance parts.",
    );
    const clean = validate(
      JSON.stringify({
        kind: "scene3d",
        title: "Assembly",
        caption: "",
        objects: t.parts,
      }),
    );
    templates.push({ id: t.id, parts: clean.objects });
  }
  const objects = [];
  ok(
    Array.isArray(s.objects) && s.objects.length <= 40,
    "3D requires 1–40 objects.",
  );
  for (const o of s.objects) {
    if (o?.type !== "assembly") {
      objects.push(o);
      continue;
    }
    const t = templates.find((t) => t.id === o.assembly);
    ok(
      t && id(o.id),
      "Assembly instance requires explicit ID and an existing assembly.",
    );
    objects.push({ ...o, type: "group" });
    for (const p of t.parts)
      objects.push({
        ...p,
        id: o.id + "__" + p.id,
        parent: p.parent ? o.id + "__" + p.parent : o.id,
      });
    ok(objects.length <= 40, "Expanded assemblies exceed 40 objects.");
  }
  return { objects, templates };
}
module.exports = { geometryFields, validateHierarchy, expandAssemblies };
