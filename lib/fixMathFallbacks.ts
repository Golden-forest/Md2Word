/**
 * Post-process a generated docx so that LaTeX formulas the underlying library
 * could not translate are re-rendered as native Word equations (OMML).
 *
 * The `@mohtasham/md-to-docx` library falls back to raw `$…$` source text for
 * any LaTeX it does not understand. We locate those `<w:t>` text runs inside
 * `word/document.xml`, re-render their LaTeX via `temml` → MathML → OMML
 * (see `mathToOmml`), and splice the result back in. Already-correct OMML
 * emitted by the library is never touched — we only rewrite `<w:t>` runs whose
 * decoded text contains `$`.
 *
 * Failure handling (silent degradation):
 *   - temml throws on one expression → that expression keeps its raw LaTeX text.
 *   - zip read/write fails → the ORIGINAL blob is returned unchanged.
 *   - any other error in the transform → original run is preserved.
 * The download must never break because of this best-effort enhancement.
 */

import { decodeXml, mathmlToOmml } from "./mathToOmml.ts";

/** Type-only import so the dynamic `import("temml")` stays out of the bundle. */
type TemmlRender = (tex: string, opts?: { displayMode?: boolean }) => string;

let temmlLoader: Promise<TemmlRender> | null = null;
async function loadTemml(): Promise<TemmlRender> {
  if (!temmlLoader) {
    temmlLoader = import("temml").then((mod) => {
      const fn: TemmlRender = (tex, opts) => {
        const render = (mod as { renderToString?: TemmlRender }).renderToString
          ?? (mod as { default?: { renderToString?: TemmlRender } }).default?.renderToString;
        if (typeof render !== "function") {
          throw new Error("temml.renderToString not found");
        }
        return render(tex, opts);
      };
      return fn;
    });
  }
  return temmlLoader;
}

/**
 * Render a LaTeX expression to an `<m:oMath>` fragment. On failure returns the
 * original LaTeX wrapped as a plain math run (so the document still reads well).
 */
async function renderLatex(tex: string, displayMode: boolean): Promise<string> {
  try {
    const render = await loadTemml();
    const mml = render(tex, { displayMode });
    return mathmlToOmml(mml);
  } catch {
    // Keep the raw LaTeX readable inside an equation.
    return `<m:oMath><m:r><m:t xml:space="preserve">${escapeForXml(tex)}</m:t></m:r></m:oMath>`;
  }
}

function escapeForXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Matches a full `<w:r>…</w:r>` run that contains a `<w:t …>$…$…</w:t>` text
 * node. Captures: (1) the `<w:rPr>…</w:rPr>` block (may be empty), (2) the text
 * content of the `<w:t>` (XML-escaped, contains `$`).
 *
 * A run can hold at most one `<w:t>` text node, so this is unambiguous.
 */
const FALLBACK_RUN_RE =
  /<w:r\b[^>]*>(?:(<w:rPr>[\s\S]*?<\/w:rPr>))?[\s\S]*?<w:t(\s[^>]*)?>([^<]*\$[^<]*)<\/w:t>\s*<\/w:r>/g;

/**
 * Split raw text (already entity-decoded) into ordered segments of text and
 * math. `$$…$$` blocks are matched before `$…$` inline. Each math segment
 * carries its display mode.
 */
interface TextSeg {
  kind: "text";
  value: string;
}
interface MathSeg {
  kind: "math";
  value: string;
  display: boolean;
}
type Segment = TextSeg | MathSeg;

function segmentText(decoded: string): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  let buf = "";
  while (i < decoded.length) {
    // Block math: $$...$$
    if (decoded.startsWith("$$", i)) {
      const close = decoded.indexOf("$$", i + 2);
      if (close !== -1) {
        if (buf) { segs.push({ kind: "text", value: buf }); buf = ""; }
        segs.push({ kind: "math", value: decoded.slice(i + 2, close), display: true });
        i = close + 2;
        continue;
      }
    }
    // Inline math: $...$
    if (decoded[i] === "$") {
      const close = decoded.indexOf("$", i + 1);
      if (close !== -1) {
        if (buf) { segs.push({ kind: "text", value: buf }); buf = ""; }
        segs.push({ kind: "math", value: decoded.slice(i + 1, close), display: false });
        i = close + 1;
        continue;
      }
    }
    buf += decoded[i];
    i++;
  }
  if (buf) segs.push({ kind: "text", value: buf });
  return segs;
}

/**
 * Rewrite `word/document.xml`: replace every `$…$` fallback text run with the
 * appropriate OMML. Pure function — given the XML string, returns the new XML
 * string. Shared by the browser Blob wrapper and the Node verification script.
 *
 * Each replaced run is split into [text][omml][text] segments, preserving the
 * run's `<w:rPr>` formatting on both the surrounding plain-text runs and the
 * injected math runs. Block (`$$…$$`) math is wrapped in `<m:oMathPara>`.
 */
export async function rewriteDocumentXml(xml: string): Promise<string> {
  const matches: { index: number; rPr: string; text: string; raw: string }[] = [];
  for (const m of xml.matchAll(FALLBACK_RUN_RE)) {
    matches.push({
      index: m.index ?? 0,
      rPr: m[1] ?? "",
      text: m[3] ?? "",
      raw: m[0],
    });
  }
  if (matches.length === 0) return xml;

  const replacements: { start: number; end: number; xml: string }[] = [];
  for (const { index, rPr, text, raw } of matches) {
    const decoded = decodeXml(text);
    if (!decoded.includes("$")) continue;
    const segs = segmentText(decoded);
    if (segs.every((s) => s.kind === "text")) continue;

    const parts: string[] = [];
    for (const seg of segs) {
      if (seg.kind === "text") {
        if (seg.value === "") continue;
        parts.push(
          `<w:r>${rPr}<w:t xml:space="preserve">${escapeForXml(seg.value)}</w:t></w:r>`,
        );
      } else {
        const tex = seg.value.replace(/^\s+|\s+$/g, "");
        if (!tex) continue;
        let omml = await renderLatex(tex, seg.display);
        if (seg.display) {
          // Block math → <m:oMathPara> wrapping the <m:oMath>.
          omml = `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${omml}</m:oMathPara>`;
        }
        // Math runs intentionally omit <m:rPr>: Word renders OMML in Cambria
        // Math regardless, which is the desired look for equations.
        parts.push(omml);
      }
    }
    replacements.push({ start: index, end: index + raw.length, xml: parts.join("") });
  }

  // Apply replacements right-to-left so earlier offsets stay valid.
  let out = xml;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    out = out.slice(0, r.start) + r.xml + out.slice(r.end);
  }
  return out;
}

/**
 * Post-process a docx Blob: unzip, rewrite `word/document.xml`, re-zip. Returns
 * the original blob unchanged if anything goes wrong (silent degradation).
 */
export async function fixMathFallbacks(blob: Blob): Promise<Blob> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(blob);
    const docFile = zip.file("word/document.xml");
    if (!docFile) return blob;
    const original = await docFile.async("string");
    const rewritten = await rewriteDocumentXml(original);
    if (rewritten === original) return blob;
    zip.file("word/document.xml", rewritten);
    const next = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
    });
    return next;
  } catch {
    return blob;
  }
}
