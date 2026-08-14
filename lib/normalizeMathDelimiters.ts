/**
 * Normalize standard LaTeX delimiters to the dollar delimiters understood by
 * remark-math and @mohtasham/md-to-docx. Markdown code is left untouched.
 */
export function normalizeMathDelimiters(markdown: string): string {
  // GPT/copied output sometimes drops the backslashes, turning block-math
  // `\[ ... \]` into bare `[ ... ]`. When those brackets sit alone on their
  // own lines we treat them as block math too (see bareBracketOpenAt). The
  // cheap pre-scan keeps the common case (no math at all) on the fast path.
  const hasStandardMath = markdown.includes("\\(") || markdown.includes("\\[");
  const hasBareBracketMath = /\n[ \t]*\[[ \t]*\r?\n/.test(markdown) || /^\[[ \t]*\r?\n/.test(markdown);
  if (!hasStandardMath && !hasBareBracketMath) return markdown;

  const code = markMarkdownCode(markdown);
  const parts: string[] = [];
  let changed = false;
  let cursor = 0;
  let i = 0;

  while (i < markdown.length) {
    let opener: { close: string; replacement: string; multiline: boolean; openLen: number; isBare: boolean } | null = null;
    if (delimiterAt(markdown, code, i, "\\(")) {
      opener = { close: "\\)", replacement: "$", multiline: false, openLen: 2, isBare: false };
    } else if (delimiterAt(markdown, code, i, "\\[")) {
      opener = { close: "\\]", replacement: "$$", multiline: true, openLen: 2, isBare: false };
    } else if (markdown[i] === "[" && code[i] === 0 && bareBracketOpenAt(markdown, i)) {
      opener = { close: "]", replacement: "$$", multiline: true, openLen: 1, isBare: true };
    }

    if (!opener) {
      i++;
      continue;
    }

    const close = findClosingDelimiter(markdown, code, i + opener.openLen, opener.close, opener.multiline, opener.isBare);
    if (close === -1) {
      i += opener.openLen;
      continue;
    }

    // Rule 3: a bare-bracket block is only math if its body contains at least
    // one LaTeX command (`\xxx`). Plain text like `[ hello ]` stays untouched.
    if (opener.isBare) {
      const body = markdown.slice(i + opener.openLen, close);
      if (!/\\[a-zA-Z]/.test(body)) {
        i += opener.openLen;
        continue;
      }
    }

    parts.push(markdown.slice(cursor, i), opener.replacement);
    parts.push(markdown.slice(i + opener.openLen, close), opener.replacement);
    changed = true;
    cursor = close + opener.close.length;
    i = cursor;
  }

  if (!changed) return markdown;
  parts.push(markdown.slice(cursor));
  return parts.join("");
}

function findClosingDelimiter(
  markdown: string,
  code: Uint8Array,
  start: number,
  closing: string,
  multiline: boolean,
  bareBracketClose = false,
): number {
  for (let i = start; i < markdown.length; i++) {
    if (!multiline && (markdown[i] === "\n" || markdown[i] === "\r")) return -1;
    if (delimiterAt(markdown, code, i, closing)) {
      // A bare `]` is only a math closer when it sits alone on its line.
      if (!bareBracketClose || bareBracketCloseAt(markdown, i)) return i;
    }
  }
  return -1;
}

/**
 * True when the `[` at `index` opens a bare-bracket math block: it must sit
 * alone on its line — only whitespace before it on the line and a newline
 * immediately after it. This is what distinguishes GPT's dropped-backslash
 * `\[` (block math) from a footnote/link/task-list bracket (inline).
 */
function bareBracketOpenAt(markdown: string, index: number): boolean {
  // Only whitespace between the line start and `[`.
  for (let j = index - 1; j >= 0; j--) {
    const c = markdown[j];
    if (c === "\n") break;
    if (c !== " " && c !== "\t") return false;
  }
  // `[` is followed by a newline (optional trailing spaces), or ends the doc.
  for (let j = index + 1; j < markdown.length; j++) {
    const c = markdown[j];
    if (c === "\n" || c === "\r") return true;
    if (c !== " " && c !== "\t") return false;
  }
  return true;
}

/** True when the `]` at `index` sits alone on its line (mirror of bareBracketOpenAt). */
function bareBracketCloseAt(markdown: string, index: number): boolean {
  for (let j = index - 1; j >= 0; j--) {
    const c = markdown[j];
    if (c === "\n") break;
    if (c !== " " && c !== "\t") return false;
  }
  for (let j = index + 1; j < markdown.length; j++) {
    const c = markdown[j];
    if (c === "\n" || c === "\r") return true;
    if (c !== " " && c !== "\t") return false;
  }
  return true;
}

function delimiterAt(markdown: string, code: Uint8Array, index: number, delimiter: string): boolean {
  return markdown.startsWith(delimiter, index)
    && code[index] === 0
    // For multi-char delimiters the second char must also be outside code.
    // `index + 1` may run past the end of the array (Uint8Array returns
    // undefined there) — treat that as "not in code" so a delimiter at the
    // very end of the document is still recognised.
    && (index + 1 >= code.length || code[index + 1] === 0)
    // A preceding backslash makes this a literal, e.g. `\\\\(`.
    && (index === 0 || markdown[index - 1] !== "\\");
}

/** Mark fenced blocks, indented code lines, and inline code spans. */
function markMarkdownCode(markdown: string): Uint8Array {
  const code = new Uint8Array(markdown.length);
  let fence: { char: "`" | "~"; length: number } | null = null;
  let lineStart = 0;

  while (lineStart < markdown.length) {
    const newline = markdown.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? markdown.length : newline + 1;
    const line = markdown.slice(lineStart, newline === -1 ? lineEnd : newline);

    if (fence) {
      code.fill(1, lineStart, lineEnd);
      const close = /^( {0,3})(`+|~+)\s*$/.exec(line);
      if (close && close[2][0] === fence.char && close[2].length >= fence.length) fence = null;
    } else {
      const open = /^( {0,3})(`{3,}|~{3,})/.exec(line);
      if (open) {
        const marker = open[2];
        fence = { char: marker[0] as "`" | "~", length: marker.length };
        code.fill(1, lineStart, lineEnd);
      } else if (/^( {4}|\t)/.test(line)) {
        code.fill(1, lineStart, lineEnd);
      }
    }
    lineStart = lineEnd;
  }

  // CommonMark code spans use matching runs of backticks and may cross lines.
  for (let i = 0; i < markdown.length;) {
    if (code[i] || markdown[i] !== "`") {
      i++;
      continue;
    }
    let runEnd = i + 1;
    while (runEnd < markdown.length && markdown[runEnd] === "`" && !code[runEnd]) runEnd++;
    const runLength = runEnd - i;
    const close = findBacktickRun(markdown, code, runEnd, runLength);
    if (close === -1) {
      i = runEnd;
      continue;
    }
    code.fill(1, i, close + runLength);
    i = close + runLength;
  }

  return code;
}

function findBacktickRun(markdown: string, code: Uint8Array, start: number, length: number): number {
  for (let i = start; i < markdown.length;) {
    if (code[i] || markdown[i] !== "`") {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < markdown.length && markdown[end] === "`" && !code[end]) end++;
    if (end - i === length) return i;
    i = end;
  }
  return -1;
}
