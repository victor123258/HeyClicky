const object = properties => ({ type: 'object', properties, additionalProperties: false, required: Object.keys(properties) });
const string = description => ({ type: 'string', description });
const number = description => ({ type: 'number', description });
const definitions = [
  ['screenshot', 'Look again at the selected display. Coordinates are normalized 0–1000.', {}],
  ['draw', 'Point or draw on the selected display. Coordinates normalized 0–1000.', { shape: { type: 'string', enum: ['pointer', 'box', 'circle', 'arrow'] }, x: number('Left/start'), y: number('Top/start'), x2: number('Right/end'), y2: number('Bottom/end'), label: string('Short label') }],
  ['click', 'Click on selected display. Always recheck screenshot afterward.', { x: number('0–1000'), y: number('0–1000'), button: { type: 'string', enum: ['left', 'right', 'double'] } }],
  ['type_text', 'Type literal Unicode text into the focused window.', { text: string('Text to type') }],
  ['press_keys', 'Send a Windows Forms SendKeys combination, e.g. ^s, {ENTER}, %{TAB}.', { keys: string('SendKeys notation') }],
  ['powershell', 'Run a PowerShell command as the current user. Always requires approval.', { command: string('Command') }],
  ['read_file', 'Read a UTF-8 text file (up to 32 KB). Requires approval.', { path: string('Absolute path') }],
  ['write_file', 'Write a UTF-8 text file. Overwrites existing content. Always requires approval.', { path: string('Absolute path'), content: string('Complete file content') }],
  ['open_url', 'Open an https/http URL in the default browser. Requires approval.', { url: string('URL') }],
  ['fetch_url', 'Fetch a public HTTPS page as text (up to 32 KB). Requires approval.', { url: string('URL') }]
];
const tools = definitions.map(([name, description, properties]) => ({ type: 'function', function: { name, description, parameters: object(properties) } }));
function validateTool(name, args) {
  const def = tools.find(t => t.function.name === name)?.function;
  if (!def || !args || typeof args !== 'object' || Array.isArray(args)) throw Error('Unknown tool or invalid arguments.');
  const fields = def.parameters.properties;
  if (Object.keys(args).some(k => !Object.hasOwn(fields, k))) throw Error('Unexpected tool argument.');
  for (const [key, rule] of Object.entries(fields)) {
    const value = args[key];
    if (typeof value !== rule.type || (rule.type === 'number' && (!Number.isFinite(value) || value < 0 || value > 1000)) || (rule.enum && !rule.enum.includes(value))) throw Error(`Invalid ${key}.`);
    if (typeof value === 'string' && (value.length > (key === 'content' ? 32000 : key === 'text' ? 8000 : 4000) || value.includes('\0'))) throw Error(`${key} is too long or contains null bytes.`);
  }
  if (args.url) {
    const url = new URL(args.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Only plain HTTP(S) URLs are allowed.');
    if (name === 'fetch_url' && url.protocol !== 'https:') throw Error('Fetching requires HTTPS.');
  }
  if (args.path && !/^(?:[A-Za-z]:[\\/]|\/)/.test(args.path)) throw Error('Use an absolute file path.');
  return args;
}
function needsApproval(name, ask = true) {
  // Reading files and fetching URLs can expose private data; never silently approve them.
  return !['screenshot', 'draw'].includes(name) && (ask || ['powershell', 'write_file', 'read_file', 'fetch_url', 'open_url'].includes(name));
}
module.exports = { tools, validateTool, needsApproval };
