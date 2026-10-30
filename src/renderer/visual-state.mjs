// Deterministic cumulative step poses. Spec has already passed main-process validation.
export function stepObjects(spec, step = 0) {
  const objects = spec.objects.map((o) => ({
    ...o,
    rotation: [...(o.rotation || [0, 0, 0])],
    scale: [...(o.scale || [1, 1, 1])],
  }));
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const s of (spec.steps || []).slice(0, step + 1))
    for (const pose of s.poses || []) {
      const o = byId.get(pose.id);
      if (!o) continue;
      if (pose.position) [o.x, o.y, o.z] = pose.position;
      if (pose.rotation) o.rotation = [...pose.rotation];
      if (pose.scale) o.scale = [...pose.scale];
    }
  return objects;
}
