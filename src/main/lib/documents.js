const fs = require("node:fs/promises");
const path = require("node:path");
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx");
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function validateDocument({ path: file, format, title, content }) {
  if (
    !["pdf", "docx", "md", "txt"].includes(format) ||
    path.extname(file).toLowerCase() !== "." + format
  )
    throw Error("Document extension must match pdf, docx, md or txt format.");
  if (title.length > 160 || content.length > 32000)
    throw Error(
      "Document limit: title 160 characters, content 32,000 characters.",
    );
}
function htmlDocument(title, content) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>@page{margin:22mm}body{font:12pt/1.65 Arial,sans-serif;color:#17202a}h1{font-size:24pt}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>${escape(title)}</h1><pre>${escape(content)}</pre></body></html>`;
}
async function documentBuffer({ format, title, content }, renderPDF) {
  if (format === "pdf") {
    if (!renderPDF) throw Error("PDF renderer unavailable.");
    return renderPDF(htmlDocument(title, content));
  }
  if (format === "docx") {
    const children = [
      new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    ];
    for (const line of content.split(/\r?\n/)) {
      const heading = /^(#{1,3})\s+(.+)/.exec(line),
        bullet = /^[-*]\s+(.+)/.exec(line);
      children.push(
        heading
          ? new Paragraph({
              text: heading[2],
              heading: [
                HeadingLevel.HEADING_1,
                HeadingLevel.HEADING_2,
                HeadingLevel.HEADING_3,
              ][heading[1].length - 1],
            })
          : bullet
            ? new Paragraph({ text: bullet[1], bullet: { level: 0 } })
            : new Paragraph({ children: [new TextRun(line)] }),
      );
    }
    return Packer.toBuffer(new Document({ sections: [{ children }] }));
  }
  return Buffer.from(
    (format === "md" ? "# " + title + "\n\n" : title + "\n\n") + content,
    "utf8",
  );
}
// Never overwrite an existing document. Approval authorizes this exact path.
async function createDocument(args, signal, renderPDF) {
  validateDocument(args);
  signal.throwIfAborted();
  const buffer = await documentBuffer(args, renderPDF);
  signal.throwIfAborted();
  await fs.writeFile(args.path, buffer, { flag: "wx", signal });
  return `Created ${args.format.toUpperCase()} document at ${args.path} (${buffer.length} bytes). Existing documents are never overwritten by this tool. Formatting is basic headings, paragraphs and DOCX bullets; verify the content before sharing.`;
}
module.exports = {
  createDocument,
  validateDocument,
  documentBuffer,
  htmlDocument,
};
