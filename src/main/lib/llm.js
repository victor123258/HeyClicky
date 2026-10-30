async function complete({ key, model, messages, tools, signal, fetchImpl = fetch }) {
  if (!key) throw Error('Add your OpenRouter API key in Settings first.');
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(90000)]),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'HeyClicky Community' },
    body: JSON.stringify({ model, messages, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}), max_tokens: 1800 })
  });
  if (!response.ok) {
    // Never surface server response bodies, which may contain private request data.
    const hint = { 401: 'Invalid API key.', 402: 'Add credit to your OpenRouter account.', 429: 'Rate limited. Try again shortly.' }[response.status];
    throw Error(hint || `AI request failed (${response.status}). Check the model supports images and tools.`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) throw Error('The model returned an empty or unsupported answer.');
  return message;
}
module.exports = { complete };
