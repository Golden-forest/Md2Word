import assert from "node:assert/strict";
import { normalizeMathDelimiters } from "../lib/normalizeMathDelimiters.ts";

const cases = [
  ["inline math", String.raw`值为 \(x^2\)。`, "值为 $x^2$。"],
  ["display math", String.raw`前文
\[
\frac{a}{b}
\]
后文`, `前文
$$
\\frac{a}{b}
$$
后文`],
  ["existing dollar math", String.raw`$x$ and $$y$$`, String.raw`$x$ and $$y$$`],
  ["inline code", "示例 `\\(x\\)`。", "示例 `\\(x\\)`。"],
  ["multi-backtick code", "示例 ``\\(x\\)``。", "示例 ``\\(x\\)``。"],
  ["fenced code", String.raw`~~~md
\(x\)
~~~`, String.raw`~~~md
\(x\)
~~~`],
  ["indented code", String.raw`    \(x\)`, String.raw`    \(x\)`],
  ["escaped literal", String.raw`\\(x\\)`, String.raw`\\(x\\)`],
  ["unmatched delimiter", String.raw`未闭合 \(x`, String.raw`未闭合 \(x`],
];

for (const [name, input, expected] of cases) {
  assert.equal(normalizeMathDelimiters(input), expected, name);
}

console.log(`PASS — ${cases.length} math delimiter normalization cases`);
