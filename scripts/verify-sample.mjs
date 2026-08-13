// Verifies lib/sample.ts: the built-in SAMPLE_MARKDOWN must survive JS template
// parsing intact. This is a regression guard for the bug where LaTeX backslash
// commands written as single `\` inside the template literal were interpreted
// as JS escape sequences — `\v` became vertical-tab U+000B (rendered as a tofu
// box in the preview and broke every `\vec`/`\frac`/`\begin` command).
//
// We read lib/sample.ts exactly as the app ships it, resolve the template
// literal the way the JS engine does at runtime, and assert the result still
// contains real LaTeX commands and NO C0 control characters.
//
// Run:  node scripts/verify-sample.mjs

import { readFile } from "node:fs/promises";

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok: ${msg}`);
  }
}

// Read lib/sample.ts and evaluate its `SAMPLE_MARKDOWN` export at runtime.
// Dynamic import runs the module through the real JS parser, so any accidental
// escape sequences (`\v`, `\f`, `\b`, …) are applied exactly as in the browser.
async function loadSample() {
  const url = new URL("../lib/sample.ts", import.meta.url);
  const mod = await import(url.href);
  return mod.SAMPLE_MARKDOWN;
}

async function main() {
  const sample = await loadSample();

  console.log("1. LaTeX commands survive template parsing (backslash present) ...");
  // Each of these is written as `\cmd` in the source template. If the `\` is
  // swallowed by a JS escape (`\v`→VT, `\f`→FF, `\b`→BS) the substring is gone.
  assert(sample.includes("\\vec{F}"), "contains \\vec{F} (vector)");
  assert(sample.includes("\\sqrt[3]{x}"), "contains \\sqrt[3]{x} (nth root)");
  assert(sample.includes("\\frac{"), "contains \\frac (fraction)");
  assert(sample.includes("\\sum_{"), "contains \\sum (summation)");
  assert(sample.includes("\\int_{"), "contains \\int (integral)");
  assert(sample.includes("\\begin{cases}"), "contains \\begin{cases}");
  assert(sample.includes("\\begin{pmatrix}"), "contains \\begin{pmatrix}");
  assert(sample.includes("\\begin{aligned}"), "contains \\begin{aligned}");

  console.log("2. No C0 control characters leaked in from JS escapes ...");
  // The defining symptom of the bug: U+000B (vertical tab) from `\v`, U+000C
  // (form feed) from `\f`, U+0008 (backspace) from `\b`. Allow tab/newline only.
  const bad = [];
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) {
      bad.push({ index: i, code: c, name: c === 0x0b ? "VT" : c === 0x0c ? "FF" : c === 0x08 ? "BS" : `U+${c.toString(16)}` });
    }
  }
  assert(bad.length === 0, `no control characters (found ${bad.length}: ${JSON.stringify(bad.slice(0, 3))})`);

  console.log("3. Markdown structure intact (delimiters, code fence, image) ...");
  assert(sample.includes("$E = mc^2$"), "inline math delimiter present");
  assert(sample.includes("$$\n\\sum"), "block math delimiter present");
  assert(sample.includes("```typescript"), "code fence present and unescaped");
  assert(sample.includes("data:image/png;base64,"), "embedded image present");

  if (process.exitCode === 1) {
    console.log("\nRESULT: FAIL");
  } else {
    console.log("\nRESULT: PASS — sample template survives JS parsing intact");
  }
}

main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exitCode = 1;
});
