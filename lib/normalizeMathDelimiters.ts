/**
 * Normalize standard LaTeX delimiters to the dollar delimiters understood by
 * remark-math and @mohtasham/md-to-docx. Markdown code is left untouched.
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown.includes("\\(") && !markdown.includes("\\[")) return markdown;

  const code = markMarkdownCode(markdown);
  const parts: string[] = [];
  let changed = false;
  let cursor = 0;
  let i = 0;

  while (i < markdown.length) {
    const opener = delimiterAt(markdown, code, i, "\\(")
      ? { close: "\\)", replacement: "$", multiline: false }
      : delimiterAt(markdown, code, i, "\\[")
        ? { close: "\\]", replacement: "$$", multiline: true }
        : null;

    if (!opener) {
      i++;
      continue;
    }

    const close = findClosingDelimiter(markdown, code, i + 2, opener.close, opener.multiline);
    if (close === -1) {
      i += 2;
      continue;
    }

    parts.push(markdown.slice(cursor, i), opener.replacement);
    parts.push(markdown.slice(i + 2, close), opener.replacement);
    changed = true;
    cursor = close + 2;
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
): number {
  for (let i = start; i < markdown.length - 1; i++) {
    if (!multiline && (markdown[i] === "\n" || markdown[i] === "\r")) return -1;
    if (delimiterAt(markdown, code, i, closing)) return i;
  }
  return -1;
}

function delimiterAt(markdown: string, code: Uint8Array, index: number, delimiter: string): boolean {
  return markdown.startsWith(delimiter, index)
    && code[index] === 0
    && code[index + 1] === 0
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
