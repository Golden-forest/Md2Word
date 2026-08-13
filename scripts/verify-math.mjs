// Verifies the LaTeX→OMML post-processor end-to-end in Node.
//
// IMPORTANT: this exercises the SAME entry point the browser uses —
// fixMathFallbacks(blob) — not just the pure rewriteDocumentXml() function.
// That matters because fixMathFallbacks does a real zip round-trip
// (JSZip.loadAsync → rewrite → generateAsync), and JSZip rejects the
// Node-native Blob unless we normalise to ArrayBuffer first (see
// fixMathFallbacks.ts). Earlier versions of this script bypassed that path by
// calling rewriteDocumentXml on a pre-extracted string, which hid the bug.
//
// Asserts:
//   (a) the Blob round-trip actually rewrites the document (not a silent no-op),
//   (b) no <w:t> run still contains raw "$\" math,
//   (c) the <m:oMath> count is >= the number of formulas,
//   (d) rewriteDocumentXml is idempotent.
//
// Run:  node scripts/verify-math.mjs

import { convertMarkdownToDocx } from "@mohtasham/md-to-docx";
import JSZip from "jszip";
import { fixMathFallbacks, rewriteDocumentXml } from "../lib/fixMathFallbacks.ts";

const md = `# Math verification

Inline supported (library already emits OMML): $E=mc^2$ and $\\frac{a}{b}$.

Inline unsupported (raw fallback): $\\vec{F}=m\\vec{a}$ and $\\sqrt[3]{x}$.

Block supported:

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

Block unsupported - integral:

$$
\\int_{0}^{\\infty} e^{-x^2}\\,dx
$$

Block unsupported - oint (big operator, exercises our <m:nary>):

$$
\\oint_{C} \\vec{F} \\cdot d\\vec{r}
$$

Block unsupported - fraction inside overline:

$$
\\overline{\\frac{a}{b}}
$$

Block unsupported - cases:

$$
\\begin{cases} x = 1 \\\\ y = 2 \\end{cases}
$$

Block unsupported - matrix:

$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
$$

Block unsupported - aligned:

$$
\\begin{aligned} a &= b+c \\\\ d &= e-f \\end{aligned}
$$
`;

// Inline: E=mc^2, a/b, vecF, sqrt[3]  -> 4
// Block : sum, int, oint, overline-frac, cases, matrix, aligned -> 7
const EXPECTED_FORMULAS = 11;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok: ${msg}`);
  }
}

async function docXmlFromBlob(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return await zip.file("word/document.xml").async("string");
}

async function main() {
  const opts = {
    documentType: "document",
    style: { fontFamily: "Arial", language: "en-US" },
    mathRendering: { enabled: true, unsupported: "text" },
    metadata: { language: "en-US", title: "math-verify" },
  };

  console.log("1. Generating docx Blob via @mohtasham/md-to-docx ...");
  const originalBlob = await convertMarkdownToDocx(md, opts);
  const originalXml = await docXmlFromBlob(originalBlob);
  const originalFallbacks = (originalXml.match(/<w:t[^>]*>[^<]*\$[^<]*<\/w:t>/g) || []).length;
  const originalOmml = (originalXml.match(/<m:oMath/g) || []).length;
  console.log(`   before: ${originalFallbacks} $-fallback runs, ${originalOmml} <m:oMath>`);
  // Sanity: the sample must actually contain fallbacks, otherwise the test is vacuous.
  assert(originalFallbacks > 0, "sample produced raw $-fallback runs (test is non-vacuous)");

  console.log("2. Post-processing via fixMathFallbacks(blob) — the browser entry point ...");
  const fixedBlob = await fixMathFallbacks(originalBlob);
  // The Blob object must have been rebuilt (different reference) — proves the
  // zip round-trip ran instead of returning the original blob unchanged.
  assert(fixedBlob !== originalBlob, "fixMathFallbacks returned a rebuilt Blob (not the original)");

  const fixedXml = await docXmlFromBlob(fixedBlob);
  const fixedOmml = (fixedXml.match(/<m:oMath/g) || []).length;
  console.log(`   after: ${fixedOmml} <m:oMath>, raw $-fallback runs: ${(fixedXml.match(/<w:t[^>]*>[^<]*\$[^<]*<\/w:t>/g) || []).length}`);

  console.log("3. Assertions on rewritten XML ...");
  const remainingFallbacks = fixedXml.match(/<w:t[^>]*>[^<]*\$[^<]*<\/w:t>/g) || [];

  // (a) No <w:t> run still contains raw "$\" math (LaTeX commands).
  const rawMathLeft = remainingFallbacks.filter((t) => /\$\\/.test(t));
  assert(rawMathLeft.length === 0, `no <w:t> run contains raw "$\\\" math (found ${rawMathLeft.length})`);

  // (b) <m:oMath> count >= number of formulas.
  assert(
    fixedOmml >= EXPECTED_FORMULAS,
    `<m:oMath> count (${fixedOmml}) >= formula count (${EXPECTED_FORMULAS})`,
  );

  // (c) All original fallbacks gone.
  assert(remainingFallbacks.length === 0, "no $-fallback <w:t> runs remain at all");

  // Spot-check: the rewritten XML contains the expected OMML structures.
  assert(/<m:acc>/.test(fixedXml), "contains <m:acc> (\\vec accent)");
  assert(/<m:rad>/.test(fixedXml), "contains <m:rad> (\\sqrt[3]{})");
  assert(/<m:f>/.test(fixedXml), "contains <m:f> (\\frac)");
  assert(/<m:d>/.test(fixedXml), "contains <m:d> (delimiters / matrix / cases)");
  assert(/<m:m>/.test(fixedXml), "contains <m:m> (matrix)");
  assert(/<m:eqArr>/.test(fixedXml), "contains <m:eqArr> (aligned)");
  assert(/<m:nary>/.test(fixedXml), "contains <m:nary> (\\int / \\sum)");

  console.log("4. Idempotency: rewriteDocumentXml on already-fixed XML is a no-op ...");
  const rewrittenAgain = await rewriteDocumentXml(fixedXml);
  assert(rewrittenAgain === fixedXml, "rewriteDocumentXml is idempotent (2nd pass is a no-op)");

  if (process.exitCode === 1) {
    console.log("\nRESULT: FAIL");
  } else {
    console.log(`\nRESULT: PASS — ${fixedOmml} native equations, 0 raw fallbacks, Blob round-trip verified`);
  }
}

main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exitCode = 1;
});
