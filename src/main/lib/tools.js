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
    'Show a safe interactive visual in the notch. spec is JSON: {kind:"chart",title,caption,items:[{label,value}]} OR {kind:"diagram",title,caption,nodes:[{id,label,x,y}],edges:[{from,to,label}]} coordinates 0–1000 OR {kind:"scene3d",title,caption,objects:[{type:"box|sphere|cylinder|cone",label,color:"#aabbcc",x,y,z,size}]} x/y/z -10..10,size 0.1..5. No scripts/assets. Caption must explain the visual and uncertainty. At most 20 chart items/nodes or 24 3D objects.',
    { spec: string("Structured visual JSON, max 20,000 characters") },
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
            ? 20000
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
  return args;
}
function needsApproval(name, ask = true) {
  // Reading files and fetching URLs can expose private data; never silently approve them.
  return (
    !["screenshot", "draw", "get_time", "show_visual"].includes(name) &&
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
