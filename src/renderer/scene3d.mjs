import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { surfaceOptions } from "./modeling-surface.mjs";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { geometry } from "./modeling-geometry.mjs";
import { visiblePartIds } from "../shared/scene-data.js";
import { stepObjects } from "./visual-state.mjs";
export function createSceneRenderer(host, spec, options = {}) {
  const rollback = [];
  try {
    return buildSceneRenderer(host, spec, options, (fn) => rollback.push(fn));
  } catch (error) {
    for (const fn of rollback.reverse()) {
      try {
        fn();
      } catch {
        /* Preserve the original initialization failure. */
      }
    }
    host.replaceChildren();
    throw error;
  }
}
function buildSceneRenderer(host, spec, options, onFailure) {
  const step = spec.steps?.[options.step ?? 0],
    highlight = new Set(step?.highlight || []);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: Boolean(options.transparent),
  });
  onFailure(() => {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x141e2c, options.transparent ? 0 : 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    spec.title + "; click a part to select; drag to orbit, scroll to zoom.",
  );
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(45, 1, 0.05, 6000),
    controls = new OrbitControls(camera, renderer.domElement),
    nodes = new Map(),
    frames = new Map(),
    parts = new Map(),
    resources = new Set(),
    transitions = [],
    colorMoves = [],
    motions = [],
    pickables = [];
  onFailure(() => controls.dispose());
  onFailure(() => resources.forEach((r) => r.dispose()));
  const objects = stepObjects(spec, options.step ?? 0),
    byId = new Map(objects.map((o) => [o.id, o])),
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches,
    duration = reduce ? 0 : (options.transitionMs ?? step?.durationMs ?? 650);
  let interactive = Boolean(options.interactive ?? true),
    disposed = false,
    frame = 0,
    last = 0,
    focusMove = null;
  onFailure(() => {
    disposed = true;
    cancelAnimationFrame(frame);
  });
  const preset = spec.lighting ?? "studio";
  // A trusted, locally generated studio environment gives metal/plastic real
  // reflections without loading HDRIs/assets or adding an opaque background.
  const room = new RoomEnvironment();
  let pmrem;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    resources.add(environment);
    scene.environment = environment.texture;
    scene.environmentIntensity =
      preset === "technical" ? 0.5 : preset === "soft" ? 1 : 0.8;
  } finally {
    room.dispose();
    pmrem?.dispose();
  }

  scene.add(
    new THREE.HemisphereLight(
      0xe4efff,
      0x38475e,
      preset === "technical" ? 1.4 : 0.9,
    ),
  );
  for (const [color, power, position] of [
    [0xfff1e3, 1.8, [8, 12, 7]],
    [0xadcfff, preset === "soft" ? 1.1 : 0.7, [-8, 4, 4]],
    [0xf2edff, 1.2, [2, 7, -9]],
  ]) {
    const l = new THREE.DirectionalLight(color, power);
    l.position.set(...position);
    scene.add(l);
  }
  if (!options.transparent) {
    const grid = new THREE.GridHelper(24, 24, 0x69809f, 0x2e4056);
    scene.add(grid);
    resources.add(grid.geometry);
    (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(
      (m) => resources.add(m),
    );
  }
  const emphasized = (o) => {
    if (!highlight.size) return true;
    for (let i = 0; o && i < 8; i++, o = byId.get(o.parent))
      if (highlight.has(o.id)) return true;
    return false;
  };
  const mat = (o) =>
    new THREE.MeshPhysicalMaterial({
      ...surfaceOptions(o, emphasized(o), Boolean(options.animate && !reduce)),
      side: THREE.DoubleSide,
    });
  const track = (root) =>
    root.traverse((c) => {
      if (c.geometry) resources.add(c.geometry);
      if (c.material) {
        resources.add(c.material);
        c.userData.baseOpacity = c.material.opacity ?? 1;
        c.userData.baseEmissive = c.material.emissive?.clone();
        c.userData.baseIntensity = c.material.emissiveIntensity ?? 0;
      }
    });
  const allowed = new Set(visiblePartIds(spec, options.step ?? 0));
  const partVisible = (o) => allowed.has(o.id);
  for (const o of objects) {
    const node = new THREE.Group(),
      content = new THREE.Group(),
      pivot = new THREE.Vector3(...(o.pivot || [0, 0, 0]));
    node.position.set(o.x, o.y, o.z).add(pivot);
    node.rotation.set(
      ...(o.rotation || [0, 0, 0]).map(THREE.MathUtils.degToRad),
    );
    node.scale.set(...(o.scale || [1, 1, 1]));
    content.position.copy(pivot).negate();
    node.add(content);
    node.visible = partVisible(o);
    nodes.set(o.id, node);
    frames.set(o.id, content);
    let mesh;
    if (o.type === "group" || o.type === "label") {
    } else if (o.type === "arrow") {
      const base = spec.objects.find((v) => v.id === o.id),
        dir = new THREE.Vector3(...o.to).sub(
          new THREE.Vector3(base.x, base.y, base.z),
        );
      mesh = new THREE.ArrowHelper(
        dir.clone().normalize(),
        new THREE.Vector3(),
        Math.max(0.01, dir.length()),
        o.color,
        0.35,
        0.22,
      );
    } else if (o.type === "line") {
      mesh = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          o.points.map((p) => new THREE.Vector3(...p)),
        ),
        new THREE.LineBasicMaterial({
          color: o.color,
          transparent: true,
          opacity: emphasized(o) ? 1 : 0.24,
        }),
      );
    } else mesh = new THREE.Mesh(geometry(o), mat(o));
    if (mesh) {
      content.add(mesh);
      mesh.traverse((c) => {
        c.userData.partId = o.id;
        if (c.isMesh || c.isLine) pickables.push(c);
      });
      track(mesh);
    }
    parts.set(o.id, { o, node, content, pivot, mesh });
  }
  for (const { o, node } of parts.values())
    (o.parent ? frames.get(o.parent) : scene).add(node);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  // Metadata-only labels and hidden descendants must not make the actual
  // geometry appear tiny. Only visible renderable parts determine framing.
  for (const { node, mesh } of parts.values())
    if (node.visible && mesh) bounds.expandByObject(mesh);
  if (bounds.isEmpty())
    bounds.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const center = bounds.getCenter(new THREE.Vector3()),
    radius = Math.max(1, bounds.getSize(new THREE.Vector3()).length() / 2);
  controls.target.copy(center);
  controls.minDistance = 0.1;
  controls.maxDistance = Math.max(150, radius * 12);
  controls.enableDamping = false;
  controls.enabled = interactive;
  for (const { o, node, pivot } of parts.values()) {
    const previous = options.previousView?.objects?.[o.id];
    let motionBase = o.motion ? node.rotation[o.motion.axis] : 0;
    if (previous && previous.parent === o.parent) {
      if (options.preserveMotion && o.motion?.mode === "rotate")
        node.quaternion.fromArray(previous.quaternion);
      if (options.preserveMotion && o.motion)
        motionBase = node.rotation[o.motion.axis];
      const goal = {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      };
      if (duration > 0) {
        node.position.fromArray(previous.position).add(pivot);
        node.quaternion.fromArray(previous.quaternion);
        node.scale.fromArray(previous.scale);
        if (
          node.position.distanceTo(goal.position) > 0.0001 ||
          node.quaternion.angleTo(goal.quaternion) > 0.0001 ||
          node.scale.distanceTo(goal.scale) > 0.0001
        )
          transitions.push({
            node,
            from: {
              position: node.position.clone(),
              quaternion: node.quaternion.clone(),
              scale: node.scale.clone(),
            },
            goal,
          });
      }
    }
    const mesh = parts.get(o.id).mesh;
    let materialIndex = 0;
    mesh?.traverse((c) => {
      if (!c.material?.color) return;
      const old = previous?.colors?.[materialIndex++];
      if (old && previous.type === o.type && duration > 0) {
        const goal = c.material.color.clone(),
          from = new THREE.Color(old);
        if (!from.equals(goal)) {
          c.material.color.copy(from);
          colorMoves.push({ material: c.material, from, goal });
        }
      }
    });
    if (o.motion) motions.push({ o, node, base: motionBase });
  }
  const draw = () => {
    if (disposed) return;
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
  };
  let firstSize = true;
  const resize = () => {
    const w = Math.max(120, host.clientWidth),
      h = options.desktop
        ? Math.max(60, host.clientHeight)
        : Math.max(220, Math.min(360, w * 0.65));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    if (firstSize) {
      firstSize = false;
      const prev = options.previousView?.camera;
      if (prev) {
        camera.position.fromArray(prev.position);
        controls.target.fromArray(prev.target);
      } else {
        const f = Math.min(
          THREE.MathUtils.degToRad(camera.fov / 2),
          Math.atan(
            Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect,
          ),
        );
        camera.position
          .copy(center)
          .add(
            new THREE.Vector3(1, 0.7, 1)
              .normalize()
              .multiplyScalar((radius / Math.sin(f)) * 1.12),
          );
      }
    }
    camera.updateProjectionMatrix();
    controls.update();
    draw();
  };
  const observer = new ResizeObserver(resize);
  onFailure(() => observer.disconnect());
  observer.observe(host);
  controls.addEventListener("change", draw);
  let start = 0;
  function animate(now) {
    frame = 0;
    if (disposed) return;
    if (document.hidden || now - last < 33) {
      frame = requestAnimationFrame(animate);
      return;
    }
    last = now;
    const elapsed = Math.max(0, now - start),
      t = duration ? Math.min(1, elapsed / duration) : 1,
      e = t * t * (3 - 2 * t);
    for (const { node, from, goal } of transitions) {
      node.position.lerpVectors(from.position, goal.position, e);
      node.quaternion.slerpQuaternions(from.quaternion, goal.quaternion, e);
      node.scale.lerpVectors(from.scale, goal.scale, e);
      if (t === 1) {
        node.position.copy(goal.position);
        node.quaternion.copy(goal.quaternion);
        node.scale.copy(goal.scale);
      }
    }
    for (const { material, from, goal } of colorMoves)
      material.color.lerpColors(from, goal, e);
    if (options.animate && !reduce)
      for (const { o, node, base } of motions) {
        const seconds =
          Math.max(0, elapsed - (transitions.length ? duration : 0)) / 1000;
        if (o.motion.mode === "rotate" && t === 1)
          node.rotation[o.motion.axis] = base + seconds * o.motion.speed;
        else if (o.motion.mode === "pulse")
          (parts.get(o.id).mesh || node).traverse((c) => {
            if (c.material)
              c.material.opacity =
                c.userData.baseOpacity *
                (0.65 + 0.35 * Math.sin(seconds * o.motion.speed * 4));
          });
      }
    if (focusMove) {
      const q = Math.min(1, (now - focusMove.start) / focusMove.duration),
        s = q * q * (3 - 2 * q);
      camera.position.lerpVectors(focusMove.from, focusMove.to, s);
      controls.target.lerpVectors(focusMove.oldTarget, focusMove.target, s);
      controls.update();
      if (q === 1) focusMove = null;
    }
    draw();
    if (
      ((transitions.length || colorMoves.length) && t < 1) ||
      (options.animate && motions.length && !reduce) ||
      focusMove
    )
      frame = requestAnimationFrame(animate);
  }
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(animate);
  };
  function setSelection(id) {
    if (id && !nodes.has(id)) id = null;
    for (const { o, mesh } of parts.values())
      mesh?.traverse((c) => {
        if (!c.material?.emissive) return;
        c.material.emissive.copy(c.userData.baseEmissive);
        c.material.emissiveIntensity = c.userData.baseIntensity;
        if (
          (() => {
            let p = o;
            for (let i = 0; p && i < 8; i++, p = byId.get(p.parent))
              if (p.id === id) return true;
            return false;
          })()
        ) {
          c.material.emissive.set("#e4a64b");
          c.material.emissiveIntensity = 0.35;
        }
      });
    draw();
  }
  function focus(id) {
    const part = parts.get(id);
    if (!part || !part.node.visible) return false;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(part.node);
    if (box.isEmpty())
      box.setFromCenterAndSize(
        part.content.getWorldPosition(new THREE.Vector3()),
        new THREE.Vector3(1, 1, 1),
      );
    const target = box.getCenter(new THREE.Vector3()),
      r = Math.max(0.3, box.getSize(new THREE.Vector3()).length() / 2),
      angle = Math.min(
        Math.PI / 8,
        Math.atan(Math.tan(Math.PI / 8) * camera.aspect),
      ),
      to = target.clone().add(
        camera.position
          .clone()
          .sub(controls.target)
          .normalize()
          .multiplyScalar((r / Math.sin(angle)) * 1.25),
      );
    if (reduce) {
      camera.position.copy(to);
      controls.target.copy(target);
      controls.update();
      draw();
    } else {
      focusMove = {
        from: camera.position.clone(),
        to,
        oldTarget: controls.target.clone(),
        target,
        start: performance.now(),
        duration: 450,
      };
      wake();
    }
    return true;
  }
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.08;
  let down = null;
  const pointerDown = (e) => {
    if (interactive && e.button === 0)
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const pointerUp = (e) => {
    const d = down;
    down = null;
    if (
      !interactive ||
      !d ||
      d.id !== e.pointerId ||
      Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5
    )
      return;
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster
      .intersectObjects(pickables)
      .find((h) => parts.get(h.object.userData.partId)?.node.visible);
    const id = hit?.object.userData.partId ?? null;
    setSelection(id);
    options.onSelect?.(id);
  };
  const cancel = () => {
      down = null;
    },
    manual = () => {
      focusMove = null;
    };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", cancel);
  controls.addEventListener("start", manual);
  resize();
  setSelection(options.selectedId ?? null);
  // Shader/environment preparation can be slow on software GPUs. Start the
  // transition clock after the first frame, not before compilation.
  start = performance.now();
  if (
    transitions.length ||
    colorMoves.length ||
    (options.animate && motions.length && !reduce)
  )
    wake();
  return {
    setSelection,
    focus,
    setInteractive(value) {
      interactive = Boolean(value);
      controls.enabled = interactive;
      down = null;
    },
    capture: () => ({
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      },
      objects: Object.fromEntries(
        [...parts].map(([id, { o, node, pivot, content }]) => [
          id,
          {
            type: o.type,
            colors: (() => {
              const list = [];
              parts.get(id).mesh?.traverse((c) => {
                if (c.material?.color)
                  list.push("#" + c.material.color.getHexString());
              });
              return list;
            })(),
            position: node.position.clone().sub(pivot).toArray(),
            quaternion: node.quaternion.toArray(),
            scale: node.scale.toArray(),
            parent: o.parent,
            worldPosition: content
              .getWorldPosition(new THREE.Vector3())
              .toArray(),
            pivotWorld: node.getWorldPosition(new THREE.Vector3()).toArray(),
            screenPoint: (() => {
              const box = new THREE.Box3().setFromObject(node),
                p = box.isEmpty()
                  ? content.getWorldPosition(new THREE.Vector3())
                  : box.getCenter(new THREE.Vector3());
              p.project(camera);
              return [
                ((p.x + 1) * renderer.domElement.clientWidth) / 2,
                ((1 - p.y) * renderer.domElement.clientHeight) / 2,
              ];
            })(),
          },
        ]),
      ),
    }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", draw);
      controls.removeEventListener("start", manual);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      resources.forEach((r) => r.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
