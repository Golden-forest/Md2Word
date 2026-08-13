// Generates a DOCX from the built-in sample using the same options as the app's
// handleDownload(). Verification-only script — not part of the shipped app.
// We read lib/sample.ts (the single source of truth) and resolve its template
// literal in Node so we always test the real sample content.
import { readFile, writeFile } from "node:fs/promises";

const sampleSrc = await readFile(new URL("../lib/sample.ts", import.meta.url), "utf8");
// lib/sample.ts is `export const SAMPLE_MARKDOWN = \`...\`;` — extract the body.
const start = sampleSrc.indexOf("`") + 1;
const end = sampleSrc.lastIndexOf("`");
const raw = sampleSrc.slice(start, end);
// Resolve the few escaped backticks/template chars the sample uses.
const SAMPLE_MARKDOWN = raw.replaceAll("\\`", "`").replaceAll("\\$", "$").replaceAll("\\\\", "\\");

const { convertMarkdownToBuffer } = await import("@mohtasham/md-to-docx");

const buffer = await convertMarkdownToBuffer(SAMPLE_MARKDOWN, {
  documentType: "document",
  style: {
    fontFamily: "Microsoft YaHei",
    language: "zh-CN",
    paragraphSize: 22,
    listItemSize: 22,
    heading1Size: 32,
    heading2Size: 28,
    heading3Size: 26,
    heading4Size: 24,
    heading5Size: 22,
    heading6Size: 22,
    lineSpacing: 1.5,
    paragraphSpacing: 180,
    headingSpacing: 220,
    tableLayout: "autofit",
  },
  codeHighlighting: { enabled: true },
  mathRendering: { enabled: true, unsupported: "text" },
  metadata: { language: "zh-CN", title: "markdown-document" },
});

await writeFile(new URL("../markdown-document.docx", import.meta.url), buffer);
console.log(`Wrote markdown-document.docx (${buffer.length} bytes)`);
