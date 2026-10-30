const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAgent } = require("../src/main/lib/agent");
const tool = (name, args, id = "1") => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
const message = (calls) => ({
  role: "assistant",
  content: null,
  tool_calls: calls,
});
const base = () => ({
  text: "Help",
  mode: "agent",
  signal: new AbortController().signal,
  execute: async () => "OK",
  approve: async () => true,
});
test("plain text response, history bounded, no actions", async () => {
  let seen;
  const result = await runAgent({
    ...base(),
    history: Array.from({ length: 20 }, () => ({
      role: "user",
      content: "hello",
    })),
    complete: async (m) => {
      seen = m;
      return { role: "assistant", content: "Hello" };
    },
  });
  assert.equal(result, "Hello");
  assert.equal(seen.length, 15);
});
test("denial never executes or allows an equivalent retry", async () => {
  let executed = 0,
    requested = 0;
  const result = await runAgent({
    ...base(),
    complete: async () => {
      requested++;
      return message([tool("powershell", { command: "Remove-Item test" })]);
    },
    approve: async () => false,
    execute: async () => executed++,
  });
  assert.equal(executed, 0);
  assert.equal(requested, 1);
  assert.match(result, /denied/);
});
test("tool arguments reviewed exactly before execution", async () => {
  let i = 0,
    approved,
    executed;
  await runAgent({
    ...base(),
    complete: async () =>
      i++
        ? { role: "assistant", content: "Done" }
        : message([tool("type_text", { text: "Hello" })]),
    approve: async (action) => {
      approved = action;
      return true;
    },
    execute: async (name, args) => {
      executed = { name, args };
      return "OK";
    },
  });
  assert.deepEqual(approved, executed);
});
test("talk mode cannot run actions even if model requests them", async () => {
  let i = 0,
    ran = false,
    results;
  await runAgent({
    ...base(),
    mode: "talk",
    complete: async (messages) => {
      if (i++) {
        results = messages;
        return { role: "assistant", content: "Cannot do that" };
      }
      return message([tool("powershell", { command: "echo hi" })]);
    },
    execute: async () => {
      ran = true;
    },
  });
  assert.equal(ran, false);
  assert.match(results.find((m) => m.role === "tool").content, /unavailable/);
});
test("invalid tool arguments cannot reach approval or execution", async () => {
  let i = 0,
    called = false;
  await runAgent({
    ...base(),
    complete: async () =>
      i++
        ? { role: "assistant", content: "Stopped" }
        : message([tool("click", { x: 1001, y: 1, button: "left" })]),
    approve: async () => {
      called = true;
    },
    execute: async () => {
      called = true;
    },
  });
  assert.equal(called, false);
});
test("stop while awaiting approval prevents execution", async () => {
  const controller = new AbortController();
  let ran = false;
  await assert.rejects(
    runAgent({
      ...base(),
      signal: controller.signal,
      complete: async () =>
        message([tool("click", { x: 1, y: 1, button: "left" })]),
      approve: async () => {
        controller.abort();
        return true;
      },
      execute: async () => (ran = true),
    }),
    { name: "AbortError" },
  );
  assert.equal(ran, false);
});
test("image tool results use image messages, not text tokens", async () => {
  let i = 0;
  await runAgent({
    ...base(),
    complete: async (messages) => {
      if (i++) {
        assert.equal(
          messages.find((m) => m.role === "tool").content,
          "New screenshot follows.",
        );
        assert.equal(
          messages.at(-1).content[0].image_url.url,
          "data:image/jpeg;base64,ABC",
        );
        return { role: "assistant", content: "I see it" };
      }
      return message([tool("screenshot", {})]);
    },
    execute: async () => "data:image/jpeg;base64,ABC",
  });
});
test("agent bounded to 12 steps", async () => {
  let steps = 0;
  await assert.rejects(
    runAgent({
      ...base(),
      complete: async () => {
        steps++;
        return message([tool("screenshot", {})]);
      },
    }),
    /12 agent steps/,
  );
  assert.equal(steps, 12);
});
test("Dubai clock question works without model/network or desktop execution", async () => {
  const events = [];
  const answer = await runAgent({
    ...base(),
    text: "what time it is in dubai?",
    mode: "talk",
    complete: () => {
      throw Error("No model needed");
    },
    execute: () => {
      throw Error("No desktop needed");
    },
    onTool: (e) => events.push(e),
  });
  assert.match(answer, /Asia\/Dubai/);
  assert.deepEqual(events, [
    { name: "get_time", status: "pending" },
    { name: "get_time", status: "done" },
  ]);
});
test("Talk can call a real timezone clock tool without approval or native execution", async () => {
  let step = 0;
  await runAgent({
    ...base(),
    mode: "talk",
    complete: async (messages, allowed) => {
      assert.ok(allowed.some((t) => t.function.name === "get_time"));
      assert.ok(allowed.some((t) => t.function.name === "fetch_url"));
      assert.ok(!allowed.some((t) => t.function.name === "powershell"));
      if (!step++)
        return message([tool("get_time", { timeZone: "Asia/Dubai" })]);
      const value = JSON.parse(messages.find((m) => m.role === "tool").content);
      assert.equal(value.timeZone, "Asia/Dubai");
      assert.match(value.source, /clock/);
      return { role: "assistant", content: "Clock checked" };
    },
    approve: () => {
      throw Error("No approval needed");
    },
    execute: () => {
      throw Error("No native execution");
    },
  });
});
test("Talk web reads still require approval", async () => {
  let step = 0,
    approved = false,
    executed = false;
  await runAgent({
    ...base(),
    mode: "talk",
    complete: async () =>
      step++
        ? { role: "assistant", content: "Read source" }
        : message([tool("fetch_url", { url: "https://example.com" })]),
    approve: async () => {
      approved = true;
      return true;
    },
    execute: async () => {
      executed = true;
      return "Source text";
    },
  });
  assert.equal(approved, true);
  assert.equal(executed, true);
});
test("Batched screenshot and action tools produce contiguous tool responses before user images", async () => {
  let step = 0;
  await runAgent({
    ...base(),
    complete: async (messages) => {
      if (!step++)
        return message([
          tool("screenshot", {}, "first"),
          tool("type_text", { text: "hello" }, "second"),
        ]);
      const assistant = messages.findIndex((m) => m.tool_calls);
      assert.equal(messages[assistant + 1].role, "tool");
      assert.equal(messages[assistant + 1].tool_call_id, "first");
      assert.equal(messages[assistant + 2].role, "tool");
      assert.equal(messages[assistant + 2].tool_call_id, "second");
      assert.equal(messages[assistant + 3].role, "user");
      return { role: "assistant", content: "Verified format" };
    },
    execute: async (name) =>
      name === "screenshot" ? "data:image/jpeg;base64,ABC" : "Typed",
  });
});
