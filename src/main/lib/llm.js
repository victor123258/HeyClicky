function requestError(status) {
  const hint = {
    401: "Invalid API key.",
    402: "Add credit to your OpenRouter account.",
    429: "Rate limited. Try again shortly.",
    400: "The selected model/provider rejected the request. Choose a model supporting function tools and images (or turn Screen context off for a text-only model).",
    404: "No compatible model/provider route found. Check the model ID and support for tools/images in Settings.",
  }[status];
  return Error(
    hint ||
      `AI request failed (${status}). Check the model supports images and tools.`,
  );
}
async function complete({
  key,
  model,
  messages,
  tools,
  signal,
  fetchImpl = fetch,
}) {
  if (!key) throw Error("Add your OpenRouter API key in Settings first.");
  const response = await fetchImpl(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.any([
        signal || new AbortController().signal,
        AbortSignal.timeout(90000),
      ]),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "HeyClicky Community",
      },
      // Do not silently route to a provider that ignores supplied tools.
      body: JSON.stringify({
        model,
        messages,
        ...(tools?.length
          ? {
              tools,
              tool_choice: "auto",
              provider: { require_parameters: true },
            }
          : {}),
        max_tokens: 8192,
      }),
    },
  );
  if (!response.ok) throw requestError(response.status);
  const data = await response.json();
  // OpenRouter can report a provider error in a successful HTTP envelope.
  if (data.error) throw requestError(Number(data.error.code) || 502);
  const choice = data.choices?.[0],
    message = choice?.message;
  if (!message || choice.finish_reason === "length")
    throw Error(
      choice?.finish_reason === "length"
        ? "The model response was truncated. Try a smaller task; no incomplete tools were executed."
        : "The model returned an empty or unsupported answer.",
    );
  const content = Array.isArray(message.content)
    ? message.content
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n")
    : message.content;
  if (message.tool_calls != null && !Array.isArray(message.tool_calls))
    throw Error(
      "The model returned malformed tool calls. No actions were executed.",
    );
  const ids = new Set();
  const calls = message.tool_calls?.map((call) => {
    const fn = call.function;
    if (
      call.type !== "function" ||
      typeof call.id !== "string" ||
      !call.id ||
      ids.has(call.id) ||
      typeof fn?.name !== "string" ||
      !fn.name ||
      !(
        typeof fn.arguments === "string" ||
        (fn.arguments &&
          typeof fn.arguments === "object" &&
          !Array.isArray(fn.arguments))
      )
    )
      throw Error(
        "The model returned malformed tool calls. No actions were executed.",
      );
    ids.add(call.id);
    return {
      id: call.id,
      type: "function",
      function: {
        name: fn.name,
        arguments:
          typeof fn.arguments === "string"
            ? fn.arguments
            : JSON.stringify(fn.arguments),
      },
    };
  });
  if (!(typeof content === "string" && content.trim()) && !calls?.length)
    throw Error("The model returned an empty or unsupported answer.");
  return {
    role: "assistant",
    content: typeof content === "string" ? content : null,
    ...(calls?.length ? { tool_calls: calls } : {}),
  };
}
module.exports = { complete };
