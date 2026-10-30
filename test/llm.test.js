const { test } = require("node:test");
const assert = require("node:assert/strict");
const { complete } = require("../src/main/lib/llm");
test("missing key avoids any network", async () => {
  await assert.rejects(
    complete({
      model: "x",
      messages: [],
      fetchImpl: () => {
        throw Error("network called");
      },
    }),
    /API key/,
  );
});
test("sends authorization only to fixed OpenRouter endpoint", async () => {
  const result = await complete({
    key: "secret",
    model: "openai/gpt-4.1",
    messages: [{ role: "user", content: "Hello" }],
    tools: [{ type: "function" }],
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer secret");
      assert.equal(JSON.parse(options.body).tool_choice, "auto");
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Hi" } }] }),
      };
    },
  });
  assert.equal(result.content, "Hi");
});
for (const [status, hint] of [
  [401, "Invalid API key"],
  [402, "credit"],
  [429, "Rate limited"],
  [500, "500"],
])
  test(`HTTP ${status} redacts server content`, async () => {
    await assert.rejects(
      complete({
        key: "secret",
        messages: [],
        fetchImpl: async () => ({
          ok: false,
          status,
          json: async () => ({ secret: "DO NOT LEAK" }),
        }),
      }),
      new RegExp(hint),
    );
  });
test("empty response rejected", async () => {
  await assert.rejects(
    complete({
      key: "key",
      messages: [],
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [] }),
      }),
    }),
    /empty or unsupported/,
  );
});
test("tool routing requires provider support; text-array content and object arguments normalize", async () => {
  const answer = await complete({
    key: "key",
    tools: [{}],
    messages: [],
    fetchImpl: async (_, options) => {
      assert.deepEqual(JSON.parse(options.body).provider, {
        require_parameters: true,
      });
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: [{ type: "text", text: "Checking clock" }],
                tool_calls: [
                  {
                    id: "clock-1",
                    type: "function",
                    function: {
                      name: "get_time",
                      arguments: { timeZone: "Asia/Dubai" },
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  });
  assert.equal(answer.content, "Checking clock");
  assert.equal(
    answer.tool_calls[0].function.arguments,
    '{"timeZone":"Asia/Dubai"}',
  );
});
test("in-band provider errors are actionable and redact remote private content", async () => {
  await assert.rejects(
    complete({
      key: "key",
      messages: [],
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ error: { code: 400, message: "PRIVATE SECRET" } }),
      }),
    }),
    (e) =>
      /model\/provider rejected/.test(e.message) &&
      !e.message.includes("PRIVATE"),
  );
});
test("malformed, duplicate or truncated tool calls cannot execute", async () => {
  for (const message of [
    {
      tool_calls: [{ id: "x", type: "function", function: { name: "click" } }],
    },
    { content: "", tool_calls: [] },
    { tool_calls: "bad" },
    {
      tool_calls: Array.from({ length: 2 }, () => ({
        id: "same",
        type: "function",
        function: { name: "screenshot", arguments: "{}" },
      })),
    },
  ])
    await assert.rejects(
      complete({
        key: "key",
        messages: [],
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ choices: [{ message }] }),
        }),
      }),
    );
  await assert.rejects(
    complete({
      key: "key",
      messages: [],
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            { finish_reason: "length", message: { content: "partial" } },
          ],
        }),
      }),
    }),
    /truncated/,
  );
});
