// Verifies the LaTeX→OMML post-processor end-to-end in Node.
//
// Runs the real @mohtasham/md-to-docx pipeline on a Markdown document with both
// library-supported and library-unsupported formulas, extracts document.xml,
// applies the SAME rewriteDocumentXml() the browser uses, and asserts:
//   (a) no <w:t> run still contains raw "$\" math, and
//   (b) the <m:oMath> count is >= the number of formulas.
//
// Run:  node scripts/verify-math.mjs

import { convertMarkdownToBuffer } from "@mohtasham/md-to-docx";
import JSZip from "jszip";
import { rewriteDocumentXml } from "../lib/fixMathFallbacks.ts";

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

async function main() {
  console.log("1. Generating docx via @mohtasham/md-to-docx ...");
  const buf = await convertMarkdownToBuffer(md, {
    documentType: "document",
    style: { fontFamily: "Arial", language: "en-US" },
    mathRendering: { enabled: true, unsupported: "text" },
    metadata: { language: "en-US", title: "math-verify" },
  });

  const zip = await JSZip.loadAsync(buf);
  const originalXml = await zip.file("word/document.xml").async("string");
  const originalFallbacks = (originalXml.match(/<w:t[^>]*>[^<]*\$[^<]*<\/w:t>/g) || []).length;
  const originalOmml = (originalXml.match(/<m:oMath/g) || []).length;
  console.log(`   before rewrite: ${originalFallbacks} $-fallback runs, ${originalOmml} <m:oMath>`);

  console.log("2. Rewriting document.xml with fixMathFallbacks logic ...");
  const rewrittenXml = await rewriteDocumentXml(originalXml);

  // Idempotency check: rewriting again must be a no-op.
  const rewrittenAgain = await rewriteDocumentXml(rewrittenXml);
  assert(rewrittenAgain === rewrittenXml, "rewrite is idempotent (2nd pass is a no-op)");

  console.log("3. Assertions on rewritten XML ...");
  const remainingFallbacks = rewrittenXml.match(/<w:t[^>]*>[^<]*\$[^<]*<\/w:t>/g) || [];
  const finalOmml = (rewrittenXml.match(/<m:oMath/g) || []).length;

  // (a) No <w:t> run still contains raw "$\" math (LaTeX commands).
  const rawMathLeft = remainingFallbacks.filter((t) => /\$\\/.test(t));
  assert(rawMathLeft.length === 0, `no <w:t> run contains raw "$\\\" math (found ${rawMathLeft.length})`);

  // (b) <m:oMath> count >= number of formulas.
  assert(
    finalOmml >= EXPECTED_FORMULAS,
    `<m:oMath> count (${finalOmml}) >= formula count (${EXPECTED_FORMULAS})`,
  );

  // Spot-check: the rewritten XML contains the expected OMML structures.
  assert(/<m:acc>/.test(rewrittenXml), "contains <m:acc> (\\vec accent)");
  assert(/<m:rad>/.test(rewrittenXml), "contains <m:rad> (\\sqrt[3]{})");
  assert(/<m:f>/.test(rewrittenXml), "contains <m:f> (\\frac)");
  assert(/<m:d>/.test(rewrittenXml), "contains <m:d> (delimiters / matrix / cases)");
  assert(/<m:m>/.test(rewrittenXml), "contains <m:m> (matrix)");
  assert(/<m:eqArr>/.test(rewrittenXml), "contains <m:eqArr> (aligned)");
  assert(/<m:nary>/.test(rewrittenXml), "contains <m:nary> (\\int / \\sum)");

  // All original fallbacks should be gone.
  assert(
    (rewrittenXml.match(/<w:t[^>]*>[^<]*\$[^<]*<\/w:t>/g) || []).length === 0,
    "no $-fallback <w:t> runs remain at all",
  );

  if (process.exitCode === 1) {
    console.log("\nRESULT: FAIL");
  } else {
    console.log(`\nRESULT: PASS — ${finalOmml} native equations, 0 raw fallbacks`);
  }
}

main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exitCode = 1;
});
