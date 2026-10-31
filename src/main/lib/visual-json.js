// Accept the two common function-calling encodings, then keep one string form
// throughout the main-process pipeline. This never evaluates model output.
function visualJSON(raw, limit, label) {
  let encoded = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    try {
      encoded = JSON.stringify(raw);
    } catch {
      throw Error(`${label} must be a JSON object without cycles.`);
    }
  }
  if (typeof encoded !== "string")
    throw Error(
      `${label} must be a JSON object or a JSON-encoded object string.`,
    );
  if (encoded.length > limit || encoded.includes("\0"))
    throw Error(
      `${label} limit is ${limit.toLocaleString("en-US")} characters; null bytes are not allowed.`,
    );
  let value;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw Error(`${label} must be valid JSON, not code or Markdown.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${label} must be a JSON object.`);
  return { encoded, value };
}
module.exports = { visualJSON };
