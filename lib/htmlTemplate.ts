// Builds a standalone, self-contained HTML document string for the "Download
// HTML" export. The body markup comes from the live preview DOM (already
// rendered with GFM + KaTeX), so we only need to ship:
//   1. The app's prose typography (mirrors .markdown-preview in globals.css,
//      scoped to body so the exported file has no app-shell).
//   2. KaTeX's stylesheet (inlined, fonts via CDN — see katexCssString.ts).
import { KATEX_CSS_STRING } from "./katexCssString";

// Prose styles for the exported document. Mirrors the .markdown-preview rules
// in app/globals.css but scoped to <body> (the exported file has no app shell,
// no .markdown-preview wrapper). Keep these in sync with globals.css when the
// preview look changes.
const PROSE_CSS = `
body {
  margin: 0 auto; max-width: 820px; padding: 40px 28px 64px;
  color: #282a2e;
  font-family: "Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif;
  font-size: 16px; line-height: 1.82; overflow-wrap: anywhere;
  background: #fff;
}
body > :first-child { margin-top: 0; }
h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.35; color: #1d1e20; letter-spacing: 0;
}
h1 { font-size: 30px; margin: 0 0 22px; padding-bottom: 15px; border-bottom: 1px solid #e7e7e9; }
h2 { font-size: 22px; margin: 34px 0 13px; }
h3 { font-size: 19px; margin: 27px 0 10px; }
h4 { font-size: 17px; margin: 23px 0 8px; }
h5, h6 { font-size: 16px; margin: 20px 0 7px; }
p { margin: 9px 0; }
a { color: #202124; text-decoration-color: #8b8d91; text-underline-offset: 3px; }
blockquote { margin: 18px 0; padding: 10px 17px; color: #555a5e; background: #f5f5f6; border-left: 3px solid #929499; }
blockquote p { margin: 0; }
ul, ol { padding-left: 24px; }
code { padding: 2px 5px; background: #f0f1f2; border-radius: 5px; font: 13px/1.5 "SFMono-Regular", Consolas, monospace; }
pre { max-width: 100%; overflow-x: auto; margin: 17px 0; padding: 17px 19px; color: #e6e8e9; background: #25282a; border-radius: 8px; }
pre code { padding: 0; color: inherit; background: transparent; }
table { display: block; width: 100%; overflow-x: auto; border-collapse: collapse; margin: 18px 0 24px; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-size: 14px; white-space: nowrap; }
th, td { min-width: 92px; padding: 8px 11px; border: 1px solid #dedfe1; text-align: left; }
th { color: #313438; background: #f3f4f4; font-weight: 650; }
tr:nth-child(even) td { background: #fafafa; }
img { display: block; max-width: 100%; height: auto; margin: 18px auto; border-radius: 6px; }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 8px 0; }
@media (max-width: 600px) {
  body { padding: 24px 18px 40px; font-size: 15px; }
}
`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Assemble a complete, standalone HTML document.
 * @param innerHtml  already-rendered body markup (from the preview DOM).
 * @param title      document <title> and visible heading fallback.
 */
export function buildHtmlDocument(innerHtml: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${PROSE_CSS}
${KATEX_CSS_STRING}
</style>
</head>
<body>
${innerHtml}
</body>
</html>
`;
}
