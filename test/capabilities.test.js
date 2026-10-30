const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { searchResults, searchWeb, text } = require("../src/main/lib/research");
const {
  createDocument,
  documentBuffer,
  htmlDocument,
} = require("../src/main/lib/documents");
const { validateVisual } = require("../src/main/lib/visuals");
const { validateTool, needsApproval } = require("../src/main/lib/tools");
const signal = () => new AbortController().signal;
test("Search parser unwraps links, strips markup and deduplicates without executing page text", () => {
  const html =
    '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpaper">A &amp; B</a><a class="result__snippet">A useful <b>source</b>.</a><a class="result__a" href="https://example.com/paper">Duplicate</a><a class="result__a" href="javascript:bad()">Invalid</a>';
  assert.deepEqual(searchResults(html), [
    {
      title: "A & B",
      url: "https://example.com/paper",
      snippet: "A useful source .",
    },
  ]);
  assert.equal(
    text("<script>steal()</script><p>Hello &lt;world&gt;</p>"),
    "Hello <world>",
  );
  assert.throws(() => searchResults("captcha"), /blocked/);
});
test("Search uses fixed public endpoint, bounded response and provenance; failure is not invented research", async () => {
  const result = JSON.parse(
    await searchWeb("my query", signal(), async (url, options) => {
      assert.equal(url, "https://html.duckduckgo.com/html/?q=my%20query");
      assert.equal(options.redirect, "error");
      return new Response(
        '<a class="result__a" href="https://example.com/">Example</a>',
        { headers: { "content-type": "text/html" } },
      );
    }),
  );
  assert.equal(result.query, "my query");
  assert.ok(result.retrievedAt);
  assert.match(result.note, /not verified/);
  await assert.rejects(
    searchWeb(
      "q",
      signal(),
      async () => new Response("blocked", { status: 403 }),
    ),
    /403/,
  );
});
test("Search and document output require approval even with desktop approvals disabled", () => {
  for (const name of ["search_web", "create_document"])
    assert.equal(needsApproval(name, false), true);
  assert.equal(needsApproval("show_visual"), false);
  assert.throws(() => validateTool("search_web", { query: " " }));
  assert.throws(() => validateTool("search_web", { query: "a".repeat(501) }));
  assert.throws(
    () =>
      validateTool("create_document", {
        path: "C:/test.exe",
        format: "pdf",
        title: "T",
        content: "Hi",
      }),
    /extension/,
  );
});
test("DOCX is a real Office ZIP containing document content; PDF HTML is escaped and offline", async () => {
  const args = {
    format: "docx",
    title: "Report",
    content: "# Heading\n- Evidence\nHello world",
  };
  const buffer = await documentBuffer(args);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  const zip = require("fflate").unzipSync(buffer);
  const xml = Buffer.from(zip["word/document.xml"]).toString("utf8");
  assert.match(xml, /Hello world/);
  assert.match(xml, /Heading/);
  const html = htmlDocument(
    "<script>bad()</script>",
    '<img src="https://evil.test">',
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.match(html, /default-src 'none'/);
  const pdf = await documentBuffer(
    { format: "pdf", title: "Hi", content: "Text" },
    async (html) => {
      assert.match(html, /Text/);
      return Buffer.from("%PDF-1.7\n");
    },
  );
  assert.match(pdf.toString(), /%PDF/);
});
test("Document writes do not overwrite; abort prevents file creation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "docs-"));
  try {
    const args = {
      path: path.join(dir, "report.md"),
      format: "md",
      title: "Report",
      content: "Source: https://example.com",
    };
    await createDocument(args, signal());
    assert.match(await fs.readFile(args.path, "utf8"), /# Report/);
    await assert.rejects(createDocument(args, signal()), { code: "EEXIST" });
    const c = new AbortController();
    c.abort();
    await assert.rejects(
      createDocument(
        { ...args, path: path.join(dir, "cancelled.md") },
        c.signal,
      ),
    );
    await assert.rejects(fs.stat(path.join(dir, "cancelled.md")), {
      code: "ENOENT",
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Visual scenes are bounded structured data: no scripts, executable assets, invalid geometry or NaN", () => {
  const scene = {
    kind: "scene3d",
    title: "Shapes",
    caption: "Illustration",
    objects: [
      {
        type: "box",
        label: "Box",
        color: "#aabbcc",
        x: 0,
        y: 1,
        z: 0,
        size: 2,
      },
    ],
  };
  const safe = validateVisual(JSON.stringify({ ...scene, script: "evil" }));
  assert.equal(safe.script, undefined);
  assert.equal(safe.objects[0].type, "box");
  for (const changes of [
    { type: "script" },
    { size: 500 },
    { color: "url(https://evil)" },
    { x: 11 },
  ])
    assert.throws(() =>
      validateVisual(
        JSON.stringify({
          ...scene,
          objects: [{ ...scene.objects[0], ...changes }],
        }),
      ),
    );
  assert.throws(() =>
    validateVisual(
      JSON.stringify({ ...scene, objects: Array(25).fill(scene.objects[0]) }),
    ),
  );
  assert.throws(() =>
    validateVisual(
      JSON.stringify({
        kind: "diagram",
        title: "x",
        caption: "x",
        nodes: [{ id: "a", label: "a", x: 0, y: 0 }],
        edges: [{ from: "a", to: "missing", label: "bad" }],
      }),
    ),
  );
  assert.equal(
    validateVisual(
      JSON.stringify({
        kind: "chart",
        title: "x",
        caption: "x",
        items: [{ label: "A", value: -2 }],
      }),
    ).items[0].value,
    -2,
  );
});
