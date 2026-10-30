import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
let dispose = () => {};
function render(host, spec, options = {}) {
  dispose();
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
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: Boolean(options.transparent),
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(
    options.transparent ? 0x000000 : 0x141e2c,
    options.transparent ? 0 : 1,
  );
  host.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    spec.title + "; drag to orbit, scroll to zoom.",
  );
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000),
    resources = [],
    bounds = new THREE.Box3(),
    motions = [];
  scene.add(new THREE.HemisphereLight(0xffffff, 0x45566e, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(8, 14, 10);
  scene.add(light);
  if (!options.transparent) {
    scene.add(new THREE.GridHelper(24, 24, 0x69809f, 0x2e4056));
    scene.add(new THREE.AxesHelper(6));
  }
  const material = (o) =>
    new THREE.MeshStandardMaterial({
      color: o.color,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent:
        o.opacity < 1 || !emphasis(o.id) || o.motion?.mode === "pulse",
      opacity: (o.opacity ?? 1) * (emphasis(o.id) ? 1 : 0.22),
      wireframe: o.wireframe || false,
      emissive: highlight.has(o.id) ? 0x5d4400 : 0x000000,
      emissiveIntensity: 0.4,
    });
  for (const o of spec.objects) {
    if (!visible(o.id)) continue;
    let node;
    if (o.type === "arrow") {
      const from = new THREE.Vector3(o.x, o.y, o.z),
        to = new THREE.Vector3(...o.to),
        dir = to.clone().sub(from);
      node = new THREE.ArrowHelper(
        dir.length() ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(),
        Math.max(0.01, dir.length()),
        o.color,
        0.35,
        0.22,
      );
      node.traverse((child) => {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity =
            (o.opacity ?? 1) * (emphasis(o.id) ? 1 : 0.22);
        }
        if (child.geometry) resources.push(child.geometry);
        if (child.material) resources.push(child.material);
      });
    } else if (o.type === "line") {
      const g = new THREE.BufferGeometry().setFromPoints(
          o.points.map((p) => new THREE.Vector3(...p)),
        ),
        m = new THREE.LineBasicMaterial({
          color: o.color,
          transparent: true,
          opacity: emphasis(o.id) ? 1 : 0.25,
        });
      node = new THREE.Line(g, m);
      resources.push(g, m);
    } else if (o.type === "label") {
      node = new THREE.Group();
    } else {
      let g;
      if (o.type === "mesh") {
        g = new THREE.BufferGeometry();
        g.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(o.vertices.flat(), 3),
        );
        g.setIndex(o.faces.flat());
        g.computeVertexNormals();
      } else if (o.type === "sphere")
        g = new THREE.SphereGeometry(o.size / 2, 24, 16);
      else if (o.type === "cylinder")
        g = new THREE.CylinderGeometry(o.size / 2, o.size / 2, o.size, 24);
      else if (o.type === "cone")
        g = new THREE.ConeGeometry(o.size / 2, o.size, 24);
      else if (o.type === "torus")
        g = new THREE.TorusGeometry(o.size / 2, o.size / 8, 12, 32);
      else if (o.type === "plane") g = new THREE.PlaneGeometry(o.size, o.size);
      else g = new THREE.BoxGeometry(o.size, o.size, o.size);
      const m = material(o);
      node = new THREE.Mesh(g, m);
      resources.push(g, m);
    }
    node.position.set(o.x, o.y, o.z);
    node.rotation.set(
      ...(o.rotation || [0, 0, 0]).map((v) => THREE.MathUtils.degToRad(v)),
    );
    node.scale.set(...(o.scale || [1, 1, 1]));
    scene.add(node);
    bounds.expandByObject(node);
    if (o.motion)
      motions.push({
        node,
        motion: o.motion,
        base: node.rotation[o.motion.axis],
        materials: (() => {
          const list = [];
          node.traverse((child) => {
            if (child.material)
              list.push({
                material: child.material,
                opacity: child.material.opacity ?? 1,
              });
          });
          return list;
        })(),
      });
    if (o.label) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 80;
      const ctx = c.getContext("2d");
      if (!options.transparent) {
        ctx.fillStyle = "#101722cc";
        ctx.fillRect(0, 0, 512, 80);
      }
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 8;
      ctx.fillStyle = highlight.has(o.id) ? "#ffe8a1" : "#fff";
      ctx.font = "40px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(o.label.slice(0, 32), 256, 50);
      const texture = new THREE.CanvasTexture(c),
        m = new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
          transparent: true,
          opacity: emphasis(o.id) ? 1 : 0.3,
        }),
        sprite = new THREE.Sprite(m);
      sprite.position.set(o.x, o.y + o.size / 2 + 0.6, o.z);
      sprite.scale.set(4, 0.625, 1);
      scene.add(sprite);
      resources.push(texture, m);
    }
  }
  if (bounds.isEmpty())
    bounds.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const center = bounds.getCenter(new THREE.Vector3()),
    radius = Math.max(1, bounds.getSize(new THREE.Vector3()).length() / 2);
  camera.position
    .copy(center)
    .add(
      new THREE.Vector3(1, 0.7, 1)
        .normalize()
        .multiplyScalar((radius / Math.tan(Math.PI / 8)) * 1.35),
    );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.minDistance = 0.5;
  controls.maxDistance = Math.max(150, radius * 10);
  controls.enableDamping = false;
  const draw = () => renderer.render(scene, camera);
  controls.addEventListener("change", draw);
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
      const f = Math.min(
        Math.PI / 8,
        Math.atan(Math.tan(Math.PI / 8) * camera.aspect),
      );
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(1, 0.7, 1)
            .normalize()
            .multiplyScalar((radius / Math.sin(f)) * 1.12),
        );
    }
    camera.updateProjectionMatrix();
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let frame = 0,
    last = 0;
  const start = performance.now(),
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = (now) => {
    frame = requestAnimationFrame(animate);
    if (document.hidden || now - last < 33) return;
    last = now;
    const seconds = (now - start) / 1000;
    for (const { node, motion, base, materials } of motions) {
      if (motion.mode === "rotate")
        node.rotation[motion.axis] = base + seconds * motion.speed;
      else
        for (const { material, opacity } of materials) {
          material.transparent = true;
          material.opacity =
            opacity * (0.65 + 0.35 * Math.sin(seconds * motion.speed * 4));
        }
    }
    draw();
  };
  if (options.animate && motions.length && !reduce)
    frame = requestAnimationFrame(animate);
  dispose = () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    controls.dispose();
    scene.traverse((o) => {
      if (o.isGridHelper || o.isAxesHelper) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    resources.forEach((r) => r.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
window.visuals = {
  render,
  clear: () => {
    dispose();
    dispose = () => {};
  },
};
