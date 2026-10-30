import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
let dispose = () => {};
function render(host, spec) {
  dispose();
  host.replaceChildren();
  if (spec.kind !== "scene3d") {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 520;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", spec.title);
    host.append(canvas);
    const c = canvas.getContext("2d");
    c.fillStyle = "#141e2c";
    c.fillRect(0, 0, 1000, 520);
    c.font = "20px Segoe UI";
    if (spec.kind === "chart") {
      const max = Math.max(...spec.items.map((i) => Math.abs(i.value)), 1),
        h = 440 / spec.items.length;
      spec.items.forEach((item, i) => {
        const y = 30 + i * h;
        c.fillStyle = "#c4d1e6";
        c.fillText(item.label.slice(0, 25), 18, y + 20);
        const width = (Math.abs(item.value) / max) * 390;
        c.fillStyle = item.value < 0 ? "#f0a2b1" : "#b4d9ee";
        c.fillRect(
          530 + (item.value < 0 ? -width : 0),
          y,
          width,
          Math.max(4, h - 12),
        );
        c.fillStyle = "#eaf1fa";
        c.fillText(String(item.value), Math.min(925, 540 + width), y + 20);
      });
      c.strokeStyle = "#708198";
      c.beginPath();
      c.moveTo(530, 18);
      c.lineTo(530, 490);
      c.stroke();
    } else {
      const point = (n) => ({
        x: 90 + (n.x / 1000) * 820,
        y: 45 + (n.y / 1000) * 410,
      });
      for (const e of spec.edges) {
        const a = point(spec.nodes.find((n) => n.id === e.from)),
          b = point(spec.nodes.find((n) => n.id === e.to));
        c.strokeStyle = "#9cacc4";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(
          b.x - 16 * Math.cos(angle - 0.4),
          b.y - 16 * Math.sin(angle - 0.4),
        );
        c.moveTo(b.x, b.y);
        c.lineTo(
          b.x - 16 * Math.cos(angle + 0.4),
          b.y - 16 * Math.sin(angle + 0.4),
        );
        c.stroke();
        c.fillStyle = "#dfd3ff";
        c.fillText(e.label.slice(0, 30), (a.x + b.x) / 2, (a.y + b.y) / 2 - 10);
      }
      for (const n of spec.nodes) {
        const p = point(n);
        c.fillStyle = "#2a3c56";
        c.fillRect(p.x - 82, p.y - 22, 164, 44);
        c.strokeStyle = "#c0aaff";
        c.strokeRect(p.x - 82, p.y - 22, 164, 44);
        c.fillStyle = "#e5edfa";
        c.textAlign = "center";
        c.fillText(n.label.slice(0, 17), p.x, p.y + 7);
        c.textAlign = "left";
      }
    }
    dispose = () => {};
    return;
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor("#141e2c");
  host.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    spec.title + "; drag to rotate, scroll to zoom.",
  );
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(14, 11, 17);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x45566e, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(8, 14, 10);
  scene.add(light);
  scene.add(new THREE.GridHelper(24, 24, 0x69809f, 0x2e4056));
  scene.add(new THREE.AxesHelper(6));
  const resources = [],
    contentBounds = new THREE.Box3();
  for (const o of spec.objects) {
    const g =
      o.type === "sphere"
        ? new THREE.SphereGeometry(o.size / 2, 24, 16)
        : o.type === "cylinder"
          ? new THREE.CylinderGeometry(o.size / 2, o.size / 2, o.size, 24)
          : o.type === "cone"
            ? new THREE.ConeGeometry(o.size / 2, o.size, 24)
            : new THREE.BoxGeometry(o.size, o.size, o.size);
    const material = new THREE.MeshStandardMaterial({
      color: o.color,
      roughness: 0.55,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(o.x, o.y, o.z);
    scene.add(mesh);
    contentBounds.expandByObject(mesh);
    resources.push(g, material);
    if (o.label) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 80;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#101722cc";
      ctx.fillRect(0, 0, 512, 80);
      ctx.fillStyle = "#fff";
      ctx.font = "40px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(o.label.slice(0, 32), 256, 50);
      const texture = new THREE.CanvasTexture(canvas),
        m = new THREE.SpriteMaterial({ map: texture, depthTest: false }),
        sprite = new THREE.Sprite(m);
      sprite.position.set(o.x, o.y + o.size / 2 + 0.6, o.z);
      sprite.scale.set(4, 0.625, 1);
      scene.add(sprite);
      resources.push(texture, m);
    }
  }
  const center = contentBounds.getCenter(new THREE.Vector3()),
    radius = Math.max(
      1,
      contentBounds.getSize(new THREE.Vector3()).length() / 2,
    );
  camera.position
    .copy(center)
    .add(
      new THREE.Vector3(1, 0.7, 1)
        .normalize()
        .multiplyScalar((radius / Math.tan(Math.PI / 8)) * 1.35),
    );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.minDistance = 2;
  controls.maxDistance = 65;
  controls.enableDamping = false;
  const draw = () => renderer.render(scene, camera);
  controls.addEventListener("change", draw);
  const resize = () => {
    const w = Math.max(200, host.clientWidth),
      h = Math.max(220, Math.min(360, w * 0.65));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  dispose = () => {
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
