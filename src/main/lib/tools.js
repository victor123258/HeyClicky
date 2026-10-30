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
    'Show a structured visual over the desktop (transparent, click-through by default) and archive it in the notch. JSON: {kind,title,caption,placement?:"left|center|right",steps?:[{title,narration,highlight:[ids],visible?:[ids],poses?:[{id,position?:[x,y,z],rotation?:[degrees,degrees,degrees],scale?:[x,y,z]}],durationMs?:0..2500}]}. kind chart: items:[{id?,label,value}] max20. diagram: nodes:[{id,label,x,y}],edges:[{from,to,label}] coords0–1000. canvas2d: elements:[{id?,type:"box|ellipse|arrow|path|text",x,y,x2?,y2?,label?,color?:"#RRGGBB",fill?:"none|#RRGGBB",fontSize?:12..48,points?:[[x,y],...]}] max80. scene3d: objects:[{id?,type:"box|sphere|cylinder|cone|torus|plane|arrow|line|label|mesh",label,color:"#RRGGBB",x,y,z,size,rotation?:[degrees,degrees,degrees],scale?:[x,y,z],opacity?,wireframe?,to?:[x,y,z],points?:[[x,y,z],...],vertices?:[[x,y,z],...],faces?:[[index,index,index],...],motion?:{mode:"rotate|pulse",axis:"x|y|z",speed:-1..1}}] max40. Positions -20..20, size .1..5, local mesh vertices -5..5 max256, faces max512; rotation ±360, scale .01..10. Arrow needs to; line needs points; mesh needs vertices/faces. Up to12 teaching steps reference stable IDs. 3D poses cumulatively move/rotate/scale parts in each step, e.g. lift a connector latch then slide a cable into place; omitted poses retain earlier step targets. Always include complete spoken teaching content and uncertainty in step narration. Foreground answers automatically narrate steps when Speak answers and Automatic visual explanations are on. Motion is user-controlled, at most8 objects; respect reduced motion. Use meshes and transforms to assemble custom educational objects. No code, URLs, textures, shaders or imported models. Caption must disclose uncertainty; not CAD or simulation.',
    { spec: string("Structured visual JSON, max 60,000 characters") },
  ],
  [
    "update_visual",
    "Edit the current visual for voice follow-ups without starting over. changes is JSON with optional title,caption,placement,steps; for 3D objects:[{id,...fields to change}] merges by stable id (new IDs require complete objects), remove:[ids]. Replace entire items/nodes/edges/elements arrays for 2D changes. Use IDs from active visual context. Removing objects referenced by steps also requires updating steps. Active step poses override base transforms; update the relevant poses or replace steps when changing an already-posed part. Only new visuals or patches that include steps auto-narrate; ordinary color/transform edits speak the final answer instead of replaying the old tutorial. This is data, not executable code; no arbitrary fields.",
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
    if (args.changes.length > 30000) throw Error("Visual patch too large.");
    const patch = JSON.parse(args.changes);
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw Error("Visual patch must be an object.");
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
