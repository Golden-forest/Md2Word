// Generates a DOCX from the built-in sample using the same options as the app's
// handleDownload(). Verification-only script — not part of the shipped app.
// We import SAMPLE_MARKDOWN directly so Node evaluates the template literal
// exactly as the browser does — no manual unescaping that could drift from the
// source's escape rules (see scripts/verify-sample.mjs).
import { writeFile } from "node:fs/promises";
import { SAMPLE_MARKDOWN } from "../lib/sample.ts";

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
