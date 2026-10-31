# Native Three.js modeling and component interaction (1.8)

No Blender installation, generated Python/JavaScript, remote assets, textures or custom shaders are required. The model emits validated structured data; trusted local functions construct the geometry. This remains an explanatory renderer, not CAD, collision simulation, or verified hardware guidance.

## Modeling vocabulary

All geometry parts retain `id`, `type`, `label`, `color`, `x/y/z`, `size`, optional `rotation` (degrees), `scale`, `opacity`, `wireframe`, `motion`. Positions are parent-local; groups default to zero position/unit size. Procedural shapes use their own profile/depth/radius dimensions, not `size`; use `scale` for overall shape changes.

- `roundedBox`: rounded cube of edge `size`, with fixed bounded tessellation; nonuniform scale makes a rounded housing/board.
- `extrude`: a simple non-self-intersecting polygon `profile:[[x,y],...]` (3–32 points, ±5), `depth:.05..5`, optional `bevel:0..min(.2,depth/2)`. No holes or executable path expressions. Do not repeat the closing point.
- `lathe`: surface of revolution from `profile:[[radius,height],...]` (2–32 points, radius 0..5, height ±5), `segments:8..64` (default 32). Profile segments must not collapse or have all-zero radii.
- `tube`: Catmull–Rom centerline from `points:[[x,y,z],...]` (2–32 nonconsecutive-duplicate points, ±5), `radius:.02..2`, `segments:8..64` (default 32), fixed 12 radial segments. This is a visual cable/pipe, not a bend-radius/routing calculation.
- `group`: transform-only assembly. A part's `parent` must name a group. Materials/color apply to geometry parts, not as an automatic group-wide material override.
- `pivot:[x,y,z]` (±5): local hinge origin. Transform is **T(position) · T(pivot) · R · S · T(-pivot)**. Children live in this transformed local frame. Posing the group rotates all attached parts about the hinge without fake translation.
- `material:{roughness,metalness,clearcoat,emissiveIntensity:0..1,emissive:'#RRGGBB'}`: bounded physical material settings; unknown fields are discarded, not evaluated. Lighting is an enum: `studio`, `soft`, `technical`.
- `description` (800 chars): explanatory component metadata, not trusted facts/instructions. `labelOffset:[x,y,z]` (±5): local callout anchor adjustment. Screen-space labels follow transformed parts, use leader lines and collision-aware placement. At most 16 callouts show simultaneously; crowded/offscreen labels hide and all available parts remain in the accessible selector.

## Tool payload compatibility

`show_visual.spec` and `update_visual.changes` accept either a JSON-encoded object string (the advertised provider schema) or a JSON object. Both normalize to the same bounded, validated data; Markdown/code and arrays are not accepted. New 3D parts may omit `x/y/z` (default 0), `size` (1), and `color` (`#a4b5cf`), including template parts. Explicit invalid values are still rejected, and arrows/meshes/procedural parts still need their required geometry. Follow-up patches keep stable IDs and merge only explicitly supplied fields. Diagrams may omit `edges` (empty list) and edge labels (empty string).

## Reusable assemblies

A scene may declare up to six `assemblies:[{id,parts:[...]}]`, each with 1–16 local parts. An object `{id:'left',type:'assembly',assembly:'connector',x:-2,y:0,z:0}` creates a group `left` and children `left__partID`. Group/part hierarchy inside a template is local to that definition. No recursive instances or external references. Templates are per-scene/session definitions, not a persistent asset marketplace or cross-session library. Follow-up tool context returns stable expanded IDs.

See [`src/shared/modeling-example.json`](../src/shared/modeling-example.json) for a complete validated reusable connector with an extruded latch, hinged parent frame, curved cable, rounded housing and lathed component. The browser preview `/canvas.html?example=modeling` uses this **explicit generic sample**, not live AI output or a model of a particular Raspberry Pi.

Step `poses` continue to target local `position`/`rotation`/`scale` cumulatively, including group joints. Group visibility reveals the group's descendants; listing a leaf automatically retains its required ancestors but not unrelated siblings. Deleting a parent requires removing/reparenting children and repairing step references in the same patch.

## Interaction

1. Ask Talk for a scene, then explicitly enable **Interact** from the notch.
2. Click a visible part (a drag or pan is not a selection), or use **Selected part** to choose a geometry part/assembly by label and stable ID.
3. **Focus part** smoothly moves the camera to its current world bounds. Manual orbit interrupts the focus move; reduced motion makes it immediate. Reset reframes the scene.
4. **Explain this component** returns the canvas to pass-through and submits a normal Talk request about the validated part ID. It uses your configured OpenRouter model/key and existing optional screenshot/speech/approval settings. Part metadata and scene context are explicitly untrusted explanatory data; a metadata label is never promoted to a user instruction.
5. Selection persists across same-scene patches only if its ID remains visible. New scenes/dismissal/deletion/hiding clear it. Camera, selection and teaching step survive ordinary patches; transform and color changes tween, except immediate steps/reduced motion. Geometry topology replacements and reparenting are not vertex morphing.
6. After selecting, voice **“explain this component”** or **“focus selected part.”** Focus is local; explanation is an AI request. Keep normal microphone setup/key requirements. Escape always returns clicks to Windows.

## Safety/performance bounds and tests

Existing limits remain: 60,000-character **canonical, expanded** spec (including templates), 30,000-character patch, 40 expanded objects, 12 teaching steps, 256 vertices/512 triangles per custom mesh, 4096 custom vertices/8192 custom triangles per scene. Procedural geometry has an additional conservative 60,000-triangle estimate; groups have at most eight levels, scale product ≤50 and bounded accumulated extent, including every cumulative step pose. Cycles, missing/non-group parents, invalid references/transforms/materials/profiles and expansion overflows reject atomically.

Selection IPC is main-frame/sender checked, bound to the current visual ID and visible part IDs, and requires explicit interaction. It cannot enable interaction on behalf of a model or access general app tools. Explain requests are rejected during foreground activity. Background workers cannot select/focus/explain the desktop scene. Existing screenshot/native-input suspension, abortable narration and background-job isolation remain.

`npm run check` / `npm test` cover canonicalization, profiles, actual Three geometry arrays, budgets, hierarchy/pose bounds, expansion IDs, label layout, selection/focus/explanation lifecycle and existing voice/approval behavior. Optional `scripts/graphics-smoke.cjs` additionally checks real WebGL frames: fixed world hinge pivot + inherited child movement, independent reused assemblies, click selection, camera focus/reset/preservation, smooth color edits, labels, pass-through and responsive layout. It is not physical Windows click/microphone/GPU/DPI/live-model acceptance.
