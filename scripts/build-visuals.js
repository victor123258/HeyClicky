require("esbuild").buildSync({
  entryPoints: [
    require("node:path").join(__dirname, "../src/renderer/visuals.js"),
  ],
  outfile: require("node:path").join(
    __dirname,
    "../src/renderer/visual-bundle.js",
  ),
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  legalComments: "eof",
});
console.log(
  "Local visual renderer bundled. No CDN or remote executable content.",
);
