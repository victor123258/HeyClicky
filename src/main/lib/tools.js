const { visualJSON } = require("./visual-json");
const object = (properties) => ({
  type: "object",
  properties,
  additionalProperties: false,
  required: Object.keys(properties),
});
const string = (description) => ({ type: "string", description });
const number = (description) => ({ type: "number", description });
const definitions = [
  [
    "search_web",
    "Search the public web for source leads. Query goes to DuckDuckGo HTML search; approval always required. Fetch and compare sources before citing facts. Can fail or be blocked.",
    { query: string("Search terms, up to 500 characters") },
  ],
  [
    "create_document",
    "Create a new PDF, DOCX, Markdown or text document at an absolute path; always asks, never overwrites. Content up to 32,000 characters. Basic formatting only.",
    {
      path: string("Absolute output path with matching extension"),
      format: { type: "string", enum: ["pdf", "docx", "md", "txt"] },
      title: string("Title, 160 max"),
      content: string("Body; simple Markdown headings/bullets in DOCX"),
    },
  ],
  [
    "show_visual",
    "Show transparent desktop 2D graphics or interactive 3D and archive them in the notch. Pass spec as a JSON-encoded object string (an object is also accepted). Follow the format guide in spec. Use stable IDs for teaching steps and follow-up edits. Data only: no code, URLs, textures, shaders or imported models. Graphics are explanatory, not verified CAD/simulation; disclose uncertainty in the caption and narration.",
    {
      spec: string(
        [
          'Structured visual JSON, max 60,000 characters: {kind,title,caption,placement?:"left|center|right",steps?:[...]}. Title max160, caption max2000; disclose uncertainty, not verified CAD/simulation. Pass a JSON-encoded object string; do not wrap it in Markdown.',
          "chart: items:[{id?,label,value}] 1..20, values ±1000000. diagram: nodes:[{id,label,x,y}] 1..20, edges?:[{from,to,label?}] max40, coordinates 0..1000. Omitted edges/edge labels default to []/empty string.",
          'canvas2d: elements:[{id?,type:"box|ellipse|arrow|path|text",x,y,x2?,y2?,label?,color?:"#RRGGBB",fill?:"none|#RRGGBB",fontSize?:12..48,points?:[[x,y],...]}] 1..80. Coordinates 0..1000; path needs 2..128 points.',
          "scene3d: objects:[{id?,type,label?,color?,x?,y?,z?,size?,rotation?,scale?,opacity?,wireframe?,to?,points?,vertices?,faces?,motion?,parent?,pivot?,labelOffset?,description?,material?,profile?,depth?,bevel?,radius?,segments?}] 1..40. Types: box,sphere,cylinder,cone,torus,plane,arrow,line,label,mesh,group,roundedBox,extrude,lathe,tube,assembly. Omitted x/y/z default to 0, size to 1, color to #a4b5cf. Positions ±20, size .1..5, color #RRGGBB. rotation:[degrees,degrees,degrees] ±360; scale:[x,y,z] .01..10; opacity .1..1, wireframe boolean.",
          'Arrow needs to:[x,y,z] ±20. Line needs points:[[x,y,z],...] 2..128, local ±5. Mesh needs vertices:[[x,y,z],...] 3..256, local ±5, faces:[[index,index,index],...] 1..512. Scene totals max4096 vertices/8192 faces. motion:{mode:"rotate|pulse",axis:"x|y|z",speed:-1..1 nonzero} max8 objects; user-controlled, respect reduced motion.',
          "Extrude needs profile:[[x,y],...] 3..32 simple noncrossing points ±5, depth .05..5, bevel 0..min(.2,depth/2). Lathe needs profile:[[radius,height],...] 2..32, radius 0..5/height ±5. Tube needs points:[[x,y,z],...] 2..32 local ±5, radius .02..2. Tube/lathe segments integer8..64 (default32).",
          'group is transform-only. parent must name a group; children use parent-local coordinates. pivot:[x,y,z] ±5 is a local hinge origin, labelOffset:[x,y,z] ±5 is legacy metadata (no floating callouts), description max800. material:{roughness,metalness,clearcoat,emissiveIntensity:0..1,emissive:"#RRGGBB"}. lighting:studio|soft|technical.',
          'Reuse with assemblies:[{id,parts:[objects with local IDs]}] up to6 templates/16 parts each, and {id,type:"assembly",assembly:templateID,...transforms}. Instances expand to group ID and instanceID__partID children. Expanded scene max40 objects, hierarchy depth8, scale product<=50, procedural triangle estimate<=60000. No recursive instances/cycles/assets/code. Use IDs from returned context for patches.',
          "Up to12 steps:[{title,narration,highlight?:[ids],visible?:[ids],poses?:[{id,position?:[x,y,z],rotation?:[degrees,degrees,degrees],scale?:[x,y,z]}],durationMs?:0..2500}]. Narration max1500 per step; include complete teaching content and uncertainty. IDs must exist. 3D poses cumulatively transform parts; omitted targets retain earlier poses. Foreground steps auto-narrate when Speak answers and Automatic visual explanations are enabled. No code, URLs, textures, shaders or imported models.",
          'Examples: 2D {"kind":"canvas2d","title":"Arrow","caption":"Conceptual","elements":[{"id":"a","type":"arrow","x":100,"y":500,"x2":900,"y2":500}]}; 3D {"kind":"scene3d","title":"Ball","caption":"Conceptual","objects":[{"id":"ball","type":"sphere","color":"#88aaff","x":0,"y":0,"z":0,"size":1}]}. Encode the whole example once as the spec string.',
        ].join(" "),
      ),
    },
  ],
  [
    "update_visual",
    "Edit the current visual for voice follow-ups without starting over. changes is JSON with optional title,caption,placement,steps,assemblies,lighting; for 3D objects:[{id,...fields to change}] merges by stable id (new IDs require complete objects), remove:[ids]. Replace entire items/nodes/edges/elements arrays for 2D changes. Use IDs from active visual context. Removing objects referenced by steps also requires updating steps. Active step poses override base transforms; update the relevant poses or replace steps when changing an already-posed part. Only new visuals or patches that include steps auto-narrate; ordinary color/transform edits speak the final answer instead of replaying the old tutorial. This is data, not executable code; no arbitrary fields.",
    { changes: string("Visual patch JSON, max 30,000 characters") },
  ],
  [
    "get_time",
    "Read the current date and time from the device clock in an IANA timezone. Use Asia/Dubai for Dubai, Asia/Dhaka for Dhaka, or an empty string for device-local time. No network or approval needed.",
    {
      timeZone: string(
        "IANA timezone, e.g. Asia/Dubai; empty for device local",
      ),
    },
  ],
  [
    "screenshot",
    "Look again at the selected display. Coordinates are normalized 0–1000.",
    {},
  ],
  [
    "draw",
    "Point or draw on the selected display. Coordinates normalized 0–1000.",
    {
      shape: { type: "string", enum: ["pointer", "box", "circle", "arrow"] },
      x: number("Left/start"),
      y: number("Top/start"),
      x2: number("Right/end"),
      y2: number("Bottom/end"),
      label: string("Short label"),
    },
  ],
  [
    "click",
    "Click on selected display. Always recheck screenshot afterward.",
    {
      x: number("0–1000"),
      y: number("0–1000"),
      button: { type: "string", enum: ["left", "right", "double"] },
    },
  ],
  [
    "type_text",
    "Type literal Unicode text into the focused window.",
    { text: string("Text to type") },
  ],
  [
    "press_keys",
    "Send a Windows Forms SendKeys combination, e.g. ^s, {ENTER}, %{TAB}.",
    { keys: string("SendKeys notation") },
  ],
  [
    "powershell",
    "Run a PowerShell command as the current user. Always requires approval.",
    { command: string("Command") },
  ],
  [
    "read_file",
    "Read a UTF-8 text file (up to 32 KB). Requires approval.",
    { path: string("Absolute path") },
  ],
  [
    "write_file",
    "Write a UTF-8 text file. Overwrites existing content. Always requires approval.",
    { path: string("Absolute path"), content: string("Complete file content") },
  ],
  [
    "open_url",
    "Open an https/http URL in the default browser. Requires approval.",
    { url: string("URL") },
  ],
  [
    "fetch_url",
    "Fetch a public HTTPS page as text (up to 32 KB). Requires approval.",
    { url: string("URL") },
  ],
];
const tools = definitions.map(([name, description, properties]) => ({
  type: "function",
  function: { name, description, parameters: object(properties) },
}));
function validateTool(name, args) {
  const def = tools.find((t) => t.function.name === name)?.function;
  if (!def || !args || typeof args !== "object" || Array.isArray(args))
    throw Error("Unknown tool or invalid arguments.");
  // Normalize only visual payloads; desktop actions keep their exact required
  // fields/types and approval review still sees the executed arguments.
  if (name === "show_visual" || name === "update_visual") {
    const key = name === "show_visual" ? "spec" : "changes";
    args = {
      ...args,
      [key]: visualJSON(
        args[key],
        key === "spec" ? 60000 : 30000,
        key === "spec" ? "Visual specification" : "Visual patch",
      ).encoded,
    };
  }
  const fields = def.parameters.properties;
  if (Object.keys(args).some((k) => !Object.hasOwn(fields, k)))
    throw Error("Unexpected tool argument.");
  for (const [key, rule] of Object.entries(fields)) {
    const value = args[key];
    if (
      typeof value !== rule.type ||
      (rule.type === "number" &&
        (!Number.isFinite(value) || value < 0 || value > 1000)) ||
      (rule.enum && !rule.enum.includes(value))
    )
      throw Error(`Invalid ${key}.`);
    if (
      typeof value === "string" &&
      (value.length >
        (key === "content"
          ? 32000
          : key === "spec"
            ? 60000
            : key === "changes"
              ? 30000
              : key === "text"
                ? 8000
                : 4000) ||
        value.includes("\0"))
    )
      throw Error(`${key} is too long or contains null bytes.`);
  }
  if (args.url) {
    const url = new URL(args.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("Only plain HTTP(S) URLs are allowed.");
    if (name === "fetch_url" && url.protocol !== "https:")
      throw Error("Fetching requires HTTPS.");
  }
  if (args.path && !/^(?:[A-Za-z]:[\\/]|\/)/.test(args.path))
    throw Error("Use an absolute file path.");
  if (name === "search_web" && (!args.query.trim() || args.query.length > 500))
    throw Error("Search query must be 1–500 characters.");
  if (name === "create_document") require("./documents").validateDocument(args);
  if (name === "show_visual") require("./visuals").validateVisual(args.spec);
  if (name === "update_visual") {
    require("./visuals").validateVisualPatch(args.changes);
  }
  return args;
}
function needsApproval(name, ask = true) {
  // Reading files and fetching URLs can expose private data; never silently approve them.
  return (
    ![
      "screenshot",
      "draw",
      "get_time",
      "show_visual",
      "update_visual",
    ].includes(name) &&
    (ask ||
      [
        "powershell",
        "write_file",
        "read_file",
        "fetch_url",
        "open_url",
        "search_web",
        "create_document",
      ].includes(name))
  );
}
module.exports = { tools, validateTool, needsApproval };
