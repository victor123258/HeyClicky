function visiblePartIds(spec, step = 0) {
  const objects = spec?.objects || [],
    listed = spec?.steps?.[step]?.visible;
  if (!listed) return objects.map((o) => o.id);
  const map = new Map(objects.map((o) => [o.id, o])),
    explicit = new Set(listed),
    visible = new Set(listed);
  for (const o of objects) {
    let p = o;
    for (let i = 0; p && i < 8; i++, p = map.get(p.parent))
      if (explicit.has(p.id)) {
        visible.add(o.id);
        break;
      }
  }
  for (const id of [...visible]) {
    let p = map.get(id);
    for (let i = 0; p?.parent && i < 8; i++, p = map.get(p.parent))
      visible.add(p.parent);
  }
  return objects.filter((o) => visible.has(o.id)).map((o) => o.id);
}
module.exports = { visiblePartIds };
