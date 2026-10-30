const $ = (s) => document.querySelector(s);
let state = { visual: null, interactive: false, step: 0, reset: 0 },
  rendered = "";
const preview = !window.desktopCanvas;
const sample = {
  id: "preview",
  jobId: null,
  spec: {
    kind: "scene3d",
    title: "Aircraft lift — conceptual desktop explanation",
    caption:
      "Simplified educational geometry only. Not an F-35 model, engineering drawing or physics simulation. The canvas background is transparent.",
    objects: [
      {
        id: "body",
        type: "mesh",
        color: "#b7c8df",
        x: 0,
        y: 0,
        z: 0,
        size: 1,
        vertices: [
          [0, 0, -4],
          [-0.5, -0.35, -1.5],
          [0.5, -0.35, -1.5],
          [-0.6, -0.35, 2],
          [0.6, -0.35, 2],
          [-0.35, 0.4, 1.8],
          [0.35, 0.4, 1.8],
          [0, 0.45, -1],
        ],
        faces: [
          [0, 1, 7],
          [0, 7, 2],
          [1, 3, 5],
          [1, 5, 7],
          [7, 5, 6],
          [7, 6, 2],
          [2, 6, 4],
          [3, 4, 6],
          [3, 6, 5],
          [0, 2, 1],
          [1, 2, 4],
          [1, 4, 3],
        ],
      },
      {
        id: "wings",
        type: "mesh",
        color: "#779acb",
        x: 0,
        y: 0,
        z: 0,
        size: 1,
        vertices: [
          [-0.35, 0, -1],
          [0.35, 0, -1],
          [-3.6, -0.05, 1.6],
          [3.6, -0.05, 1.6],
          [-1.2, 0, 2],
          [1.2, 0, 2],
        ],
        faces: [
          [0, 2, 4],
          [0, 4, 1],
          [1, 4, 5],
          [1, 5, 3],
        ],
      },
      {
        id: "tail",
        type: "mesh",
        color: "#96b4d8",
        x: 0,
        y: 0,
        z: 0,
        size: 1,
        vertices: [
          [-0.4, 0.2, 1],
          [-0.8, 1.5, 2],
          [-0.9, 0.2, 2.5],
          [0.4, 0.2, 1],
          [0.8, 1.5, 2],
          [0.9, 0.2, 2.5],
        ],
        faces: [
          [0, 1, 2],
          [3, 4, 5],
        ],
      },
      {
        id: "cockpit",
        type: "sphere",
        color: "#548eaa",
        x: 0,
        y: 0.42,
        z: -1.3,
        size: 1,
        scale: [0.6, 0.45, 1.5],
        opacity: 0.85,
      },
      {
        id: "engine",
        type: "cylinder",
        color: "#415773",
        x: 0,
        y: 0,
        z: 2,
        size: 1,
        scale: [0.8, 0.8, 0.8],
        rotation: [90, 0, 0],
        motion: { mode: "pulse", axis: "z", speed: 0.5 },
      },
      {
        id: "lift",
        type: "arrow",
        color: "#b5e197",
        x: -2,
        y: 0,
        z: 0,
        to: [-2, 3, 0],
        size: 1,
      },
      {
        id: "thrust",
        type: "arrow",
        color: "#eac596",
        x: 0,
        y: 0,
        z: 2.5,
        to: [0, 0, 4.5],
        size: 1,
      },
      {
        id: "label-airframe",
        type: "label",
        label: "Airframe",
        color: "#ffffff",
        x: 3,
        y: 1,
        z: 1,
        size: 0.1,
      },
      {
        id: "label-lift",
        type: "label",
        label: "Lift",
        color: "#ffffff",
        x: -2,
        y: 3,
        z: 0,
        size: 0.1,
      },
      {
        id: "label-thrust",
        type: "label",
        label: "Exhaust direction",
        color: "#ffffff",
        x: 0,
        y: 0,
        z: 4.5,
        size: 0.1,
      },
    ],
    steps: [
      {
        title: "1. Airframe",
        narration:
          "A simple custom mesh assembles the airframe, swept wings and tail. Drag to orbit and inspect its parts. This is a conceptual illustration, not a verified aircraft model.",
        highlight: [
          "body",
          "wings",
          "tail",
          "cockpit",
          "engine",
          "label-airframe",
        ],
      },
      {
        title: "2. Forces",
        narration:
          "The green arrow illustrates lift. The amber arrow marks exhaust direction, not a measured thrust vector. Arrow motion is illustrative; this is not an aircraft simulation.",
        highlight: ["lift", "thrust", "label-lift", "label-thrust"],
      },
    ],
  },
};
async function command(action, value) {
  try {
    if (preview) {
      if (action === "dismiss") {
        state.visual = null;
        draw(state);
        return;
      }
      if (action === "step") state.step = value;
      else if (action === "animate") state.animate = value;
      else if (action === "reset") state.reset++;
      else if (action === "passthrough") state.interactive = false;
      else if (action === "interact") state.interactive = true;
      else
        throw Error(
          "Narration is available in the Windows app; this is a visual preview only.",
        );
      draw(state);
      return;
    }
    const result = await window.desktopCanvas.command(action, value);
    if (result?.ok === false) throw Error(result.error);
  } catch (e) {
    $("#error").hidden = false;
    $("#error").textContent = e.message;
  }
}
function draw(next) {
  state = next;
  document.body.classList.toggle("interactive", state.interactive);
  const visual = state.visual;
  if (!visual) {
    window.visuals?.clear();
    $("#stage").replaceChildren();
    $("#title").textContent = "Visual dismissed";
    return;
  }
  const spec = visual.spec,
    steps = spec.steps || [],
    step = steps[state.step];
  $("#title").textContent = spec.title;
  $("#input-mode").textContent = state.interactive
    ? "INTERACTING · Escape returns clicks to Windows"
    : "PASS-THROUGH · select Interact in the notch";
  const select = $("#step-select");
  select.replaceChildren(
    ...(steps.length ? steps : [{ title: "Explanation" }]).map((s, i) => {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = s.title;
      return option;
    }),
  );
  select.value = state.step;
  $("#caption").textContent = step?.narration || spec.caption;
  $("#error").textContent = state.error || "";
  $("#error").hidden = !state.error;
  $("#stop-audio").hidden = state.audio === "off";
  $("#animate").textContent = state.animate ? "Pause motion" : "Play motion";
  for (const button of document.querySelectorAll("button,select"))
    button.disabled = !state.interactive;
  $("#previous").disabled = !state.interactive || state.step <= 0;
  $("#next").disabled = !state.interactive || state.step >= steps.length - 1;
  select.disabled = !state.interactive || !steps.length;
  const key =
    visual.id +
    ":" +
    state.step +
    ":" +
    state.reset +
    ":" +
    Boolean(state.animate);
  if (key !== rendered) {
    rendered = key;
    try {
      window.visuals.render($("#stage"), spec, {
        transparent: true,
        desktop: true,
        step: state.step,
        animate: state.animate,
      });
    } catch (e) {
      $("#stage").textContent =
        "Unable to display this visual. Use a 2D explanation if WebGL is unavailable.";
      $("#error").hidden = false;
      $("#error").textContent = e.message;
      window.desktopCanvas?.reportError(e.message);
    }
  }
}
$("#animate").onclick = () => command("animate", !state.animate);
$("#dismiss").onclick = () => command("dismiss");
$("#passthrough").onclick = () => command("passthrough");
$("#reset").onclick = () => command("reset");
$("#previous").onclick = () => command("step", state.step - 1);
$("#next").onclick = () => command("step", state.step + 1);
$("#step-select").onchange = (e) => command("step", Number(e.target.value));
$("#narrate").onclick = () => command("narrate");
$("#tour").onclick = () => command("tour");
$("#stop-audio").onclick = () => command("stop-audio");
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    command("passthrough");
  }
});
if (preview) {
  draw({
    visual: sample,
    interactive: true,
    step: 0,
    reset: 0,
    audio: "off",
    error: "",
  });
  document.title = "Desktop canvas preview — not live AI or Windows";
} else {
  window.desktopCanvas.onState(draw);
  window.desktopCanvas
    .get()
    .then(draw)
    .catch((e) => {
      $("#error").hidden = false;
      $("#error").textContent = e.message;
    });
}
