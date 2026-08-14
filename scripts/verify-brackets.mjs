// Verifies normalizeMathDelimiters handles GPT's dropped-backslash block math
// `[ ... ]` while NOT mistaking ordinary Markdown brackets for math.
//
// Run:  npx tsx scripts/verify-brackets.mjs

import { normalizeMathDelimiters } from "../lib/normalizeMathDelimiters.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok: ${msg}`);
  }
}

// Count $$ block-math delimiters in the output.
const blockMathCount = (s) => (s.match(/\$\$/g) || []).length / 2;

// --- POSITIVE: these MUST be recognised as block math ----------------------

const userFormula = String.raw`[
\sin\theta_0=\frac{d/2}{d}=\frac12
]

所以

[
\theta_0=30^\circ.
]`;
let out = normalizeMathDelimiters(userFormula);
assert(blockMathCount(out) === 2, `user's bare-bracket formula → 2 block math (got ${blockMathCount(out)})`);
assert(!/\n\[\n/.test(out), "no lone bare `[` opener remains in user formula");
assert(out.includes("\\sin\\theta_0"), "formula body preserved verbatim");

const standardForm = String.raw`\[
\frac{a}{b}
\]`;
out = normalizeMathDelimiters(standardForm);
assert(blockMathCount(out) === 1, `standard \[ ... \] still works (got ${blockMathCount(out)})`);

// Bare brackets with leading indentation and trailing spaces around brackets.
const indented = String.raw`text

   [
   \sqrt{x}
   ]

end`;
out = normalizeMathDelimiters(indented);
assert(blockMathCount(out) === 1, `indented bare bracket with trailing spaces → math (got ${blockMathCount(out)})`);

// --- NEGATIVE: these must NOT be mistaken for math -------------------------

const mixed = String.raw`See [链接文字](https://example.com) and footnote[^1].

- [x] 完成任务
- [ ] 待办

段落里有 [普通] 方括号 和 [1] 引用.

\`code with [ \frac ] should be safe\`

\`\`\`
[
\sin x
]
\`\`\`

普通列表: [a, b, c] 是数组.
`;
out = normalizeMathDelimiters(mixed);
assert(blockMathCount(out) === 0, `link/footnote/tasklist/code/inline-text → NOT math (got ${blockMathCount(out)})`);
assert(out.includes("[链接文字](https://example.com)"), "inline link preserved");
assert(out.includes("[^1]"), "footnote preserved");
assert(out.includes("- [x] 完成任务"), "task-list preserved");
assert(out.includes("[普通]"), "inline ordinary bracket preserved");
assert(out.includes("[1]"), "numeric reference preserved");
assert(out.includes(String.raw`[ \frac ]`), "bracket inside inline code preserved");
assert(out.includes("[\n\\sin x\n]"), "bracket inside fenced code preserved");

// Bare bracket block whose body has NO LaTeX command → plain text, not math.
const noCommand = String.raw`[
just plain text, no commands
]`;
out = normalizeMathDelimiters(noCommand);
assert(blockMathCount(out) === 0, `bare bracket without \\command stays plain (got ${blockMathCount(out)})`);
assert(out === noCommand, "no-command bare bracket returned verbatim");

// Single-line `[ ... ]` (same line) → NOT block math (it's inline-like).
const singleLine = String.raw`[ \frac{a}{b} ] inline`;
out = normalizeMathDelimiters(singleLine);
assert(blockMathCount(out) === 0, `single-line [ ... ] not treated as block math (got ${blockMathCount(out)})`);

// Unclosed bare `[` → leave untouched, don't crash.
const unclosed = String.raw`[
\sin x`;
out = normalizeMathDelimiters(unclosed);
assert(out === unclosed, "unclosed bare `[` returned verbatim (no crash)");

if (process.exitCode === 1) {
  console.log("\nRESULT: FAIL");
} else {
  console.log("\nRESULT: PASS — bare-bracket math recovered, ordinary brackets untouched");
}
