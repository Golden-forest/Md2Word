/**
 * MathML → OMML (Office Math Markup Language) transformer.
 *
 * Pure string-in / string-out. Never throws: any unsupported subtree degrades
 * to a plain `<m:r><m:t>…</m:t></m:r>` text run. The whole document must always
 * succeed even if one expression cannot be converted.
 *
 * Input is the Presentation MathML produced by `temml.renderToString()`. Output
 * is a bare `<m:oMath>…</m:oMath>` fragment — the `m:` prefix is already
 * declared on `word/document.xml`, so we do NOT redeclare namespaces here.
 */

import { DOMParser } from "@xmldom/xmldom";

/** XML-escape text for safe insertion into an XML text node. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Decode XML entities in a captured LaTeX string before passing to temml. */
export function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Minimal subset of the MathML DOM we rely on. `@xmldom/xmldom` provides the
 * standard Element/Node interface; this duck-typed shape keeps the transformer
 * decoupled from a specific DOM implementation for testability.
 */
interface MmlNode {
  nodeType: number;
  nodeName: string;
  textContent: string;
  attributes: NamedNodeMap;
  childNodes: { length: number; [index: number]: MmlNode };
}

function isElement(node: MmlNode | null): node is MmlNode {
  return !!node && node.nodeType === 1;
}

/** Element children only (skip text/whitespace nodes). */
function elementChildren(node: MmlNode): MmlNode[] {
  const out: MmlNode[] = [];
  const kids = node.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (isElement(child)) out.push(child);
  }
  return out;
}

function attr(node: MmlNode, name: string): string | null {
  const a = node.attributes.getNamedItem(name);
  return a ? a.value : null;
}

/** Convert one MathML element subtree to an OMML XML string. Never throws. */
function convertNode(node: MmlNode): string {
  try {
    switch (node.nodeName) {
      case "math":
      case "semantics":
        return convertContainer(node);
      case "mrow":
        return convertMrow(node);
      case "mstyle":
        return elementChildren(node).map(convertNode).join("");
      case "mfrac":
        return convertMfrac(node);
      case "msqrt":
        return convertRad(node);
      case "mroot":
        return convertMroot(node);
      case "msub":
        return convertScript(node, "sSub", 1);
      case "msup":
        return convertScript(node, "sSup", 1);
      case "msubsup":
        return convertScript(node, "sSubSup", 2);
      case "munder":
        return convertUnderOver(node);
      case "mover":
        return convertMover(node);
      case "munderover":
        return convertUnderOver(node);
      case "mtable":
        return convertMtable(node, null);
      case "mfenced":
        return convertMfenced(node);
      case "menclose":
        return convertMenclose(node);
      case "mspace":
        return "";
      case "mi":
      case "mn":
      case "mo":
      case "mtext":
      case "ms":
        return convertToken(node);
      default:
        return textFallback(node);
    }
  } catch {
    return textFallback(node);
  }
}

/** `<m:r><m:t>text</m:t></m:r>` — run with a text node, no formatting. */
function mathRun(text: string): string {
  if (text === "") return "";
  return `<m:r><m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`;
}

/** Plain text fallback for an unsupported subtree — emit its text content. */
function textFallback(node: MmlNode): string {
  const text = (node.textContent || "").trim();
  return mathRun(text);
}

function convertToken(node: MmlNode): string {
  return mathRun(node.textContent || "");
}

/** `<math>` / `<semantics>` container: try fenced-table detection, else flatten. */
function convertContainer(node: MmlNode): string {
  const fenced = maybeFencedTable(node);
  if (fenced !== null) return fenced;
  return elementChildren(node).map(convertNode).join("");
}

/** `<mrow>`: if it is fence-delimited content (e.g. matrix/cases), wrap in `<m:d>`. */
function convertMrow(node: MmlNode): string {
  const fenced = maybeFencedRow(node);
  if (fenced !== null) return fenced;
  return elementChildren(node).map(convertNode).join("");
}

/**
 * Detect `<mrow>` whose first/last children are fence `<mo>` (form=prefix/postfix)
 * — temml emits matrices/cases this way instead of using `<mfenced>`. Wrap the
 * inner content in `<m:d>` delimiters so Word renders proper stretchy brackets.
 */
function maybeFencedRow(node: MmlNode): string | null {
  const kids = elementChildren(node);
  if (kids.length < 2) return null;
  const first = kids[0];
  const last = kids[kids.length - 1];
  if (!isFenceMo(first, "prefix") || !isFenceMo(last, "postfix")) return null;
  const middle = kids.slice(1, -1);
  const beg = (first.textContent || "(").trim() || "(";
  const end = (last.textContent || ")").trim() || ")";
  if (middle.length === 1 && middle[0].nodeName === "mtable") {
    return convertMtable(middle[0], { beg, end });
  }
  const body = middle.map(convertNode).join("");
  return (
    `<m:d><m:dPr><m:begChr m:val="${escapeXml(beg)}"/>` +
    `<m:endChr m:val="${escapeXml(end)}"/></m:dPr><m:e>${body}</m:e></m:d>`
  );
}

function isFenceMo(node: MmlNode | undefined, form: string): boolean {
  return !!node && node.nodeName === "mo" && attr(node, "fence") === "true" && attr(node, "form") === form;
}

/** `<mfrac><a/><b/></mfrac>` → `<m:f><m:num>a</m:num><m:den>b</m:den></m:f>`. */
function convertMfrac(node: MmlNode): string {
  const kids = elementChildren(node);
  const num = kids[0] ? convertNode(kids[0]) : "";
  const den = kids[1] ? convertNode(kids[1]) : "";
  return `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;
}

/**
 * `<msqrt>…</msqrt>` → `<m:rad>` with the degree hidden (plain square root).
 * nth-root (`<mroot>`) is handled by `convertMroot` which supplies the degree.
 */
function convertRad(node: MmlNode): string {
  const body = elementChildren(node).map(convertNode).join("");
  return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${body}</m:e></m:rad>`;
}

/**
 * `<mroot><base/><index/></mroot>` → nth root. Standard MathML order is
 * base, then index (temml follows this: `<mroot><mrow>x…</mrow><mn>3</mn></mroot>`).
 */
function convertMroot(node: MmlNode): string {
  const kids = elementChildren(node);
  const base = kids[0] ? convertNode(kids[0]) : "";
  const index = kids[1];
  const degree = index ? convertNode(index) : "";
  return `<m:rad><m:radPr/>${index ? `<m:deg>${degree}</m:deg>` : "<m:deg/>"}<m:e>${base}</m:e></m:rad>`;
}

/** Sub/super/subsup scripts. `scriptCount` is 1 (single) or 2 (both). */
function convertScript(node: MmlNode, kind: "sSub" | "sSup" | "sSubSup", scriptCount: number): string {
  const kids = elementChildren(node);
  const base = kids[0];
  // Big operator (∑ ∫ ∏ …) with scripts → <m:nary> so limits render correctly.
  if (base && base.nodeName === "mo" && NARY_OPS.has((base.textContent || "").trim())) {
    return convertNaryFromScript(node, kind);
  }
  const baseXml = base ? convertNode(base) : "";
  const sub = scriptCount >= 1 && kids[1] ? convertNode(kids[1]) : "";
  const sup = scriptCount >= 2 && kids[2] ? convertNode(kids[2]) : "";
  if (kind === "sSub") return `<m:sSub><m:e>${baseXml}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
  if (kind === "sSup") return `<m:sSup><m:e>${baseXml}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
  return `<m:sSubSup><m:e>${baseXml}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
}

/** Build `<m:nary>` from an msub/msup/msubsup whose base is an n-ary operator. */
function convertNaryFromScript(node: MmlNode, kind: "sSub" | "sSup" | "sSubSup"): string {
  const kids = elementChildren(node);
  const op = escapeXml((kids[0]?.textContent || "").trim());
  const sub = kind !== "sSup" && kids[1] ? convertNode(kids[1]) : "";
  const sup = kind === "sSubSup" && kids[2] ? convertNode(kids[2])
    : kind === "sSup" && kids[1] ? convertNode(kids[1]) : "";
  const trailing = kids.slice(kind === "sSubSup" ? 3 : 2).map(convertNode).join("");
  const subHide = sub ? "0" : "1";
  const supHide = sup ? "0" : "1";
  return (
    `<m:nary><m:naryPr><m:chr m:val="${op}"/><m:limLoc m:val="undOvr"/>` +
    `<m:subHide m:val="${subHide}"/><m:supHide m:val="${supHide}"/></m:naryPr>` +
    `<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e>${trailing}</m:e></m:nary>`
  );
}

/**
 * `<munderover>` with a large operator (mo movablelimits) as base → `<m:nary>`
 * (e.g. ∫, ∑). Otherwise degrade to nested limLow/limUpp so both scripts render.
 */
function convertUnderOver(node: MmlNode): string {
  const kids = elementChildren(node);
  if (kids.length === 0) return "";
  const base = kids[0];
  // N-ary operator (∑, ∫, ∏, ⋃, ⋂, ∮ …): build <m:nary>.
  const opText = base && base.nodeName === "mo" ? (base.textContent || "") : "";
  const isNary = base && base.nodeName === "mo" && NARY_OPS.has(opText.trim());
  if (isNary && kids.length >= 3) {
    const sub = kids[1] ? convertNode(kids[1]) : "";
    const sup = kids[2] ? convertNode(kids[2]) : "";
    const op = escapeXml(opText.trim());
    const trailing = kids.slice(3).map(convertNode).join("");
    return (
      `<m:nary><m:naryPr><m:chr m:val="${op}"/><m:limLoc m:val="undOvr"/>` +
      `<m:subHide m:val="0"/><m:supHide m:val="0"/></m:naryPr>` +
      `<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e>${trailing}</m:e></m:nary>`
    );
  }
  if (kids.length === 2) {
    return `<m:limLow><m:e>${convertNode(kids[0])}</m:e><m:lim>${convertNode(kids[1])}</m:lim></m:limLow>`;
  }
  if (kids.length >= 3) {
    // Non-nary under+over: nest limLow (under) inside limUpp (over).
    const under = `<m:limLow><m:e>${convertNode(kids[0])}</m:e><m:lim>${convertNode(kids[1])}</m:lim></m:limLow>`;
    return `<m:limUpp><m:e>${under}</m:e><m:lim>${convertNode(kids[2])}</m:lim></m:limUpp>`;
  }
  return convertNode(kids[0]);
}

/** Large operators that become `<m:nary>` when under/over-scripted. */
const NARY_OPS = new Set(["∑", "∫", "∏", "∐", "⋃", "⋂", "∪", "∩", "∮", "∯", "∰", "⊕", "⊗"]);

/** `<mover><base/><mo>acc</mo></mover>` → `<m:acc>` accent. */
function convertMover(node: MmlNode): string {
  const kids = elementChildren(node);
  if (kids.length < 2) {
    return kids.map(convertNode).join("");
  }
  const base = kids[0];
  const acc = kids[1];
  // Only an <mo> accent qualifies for <m:acc>.
  if (acc && acc.nodeName === "mo") {
    const chr = mapAccentChar((acc.textContent || "").trim());
    if (chr) {
      const baseXml = convertNode(base);
      return (
        `<m:acc><m:accPr><m:chr m:val="${escapeXml(chr)}"/></m:accPr>` +
        `<m:e>${baseXml}</m:e></m:acc>`
      );
    }
  }
  // Not an accent → limUpp (overset).
  const baseXml = convertNode(kids[0]);
  const lim = kids.slice(1).map(convertNode).join("");
  return `<m:limUpp><m:e>${baseXml}</m:e><m:lim>${lim}</m:lim></m:limUpp>`;
}

/** Map a MathML accent glyph to the OMML accent character. */
function mapAccentChar(ch: string): string | null {
  switch (ch) {
    case "→": // \vec
    case "⇀":
    case "↔":
      return "→";
    case "^":
    case "ˆ": // \hat
      return "̂";
    case "ˇ": // \check
      return "̌";
    case "~":
    case "̃": // \tilde
      return "̃";
    case "‾":
    case "¯": // \bar / \overline
      return "‾";
    case ".":
    case "˙": // \dot
      return "̇";
    case "¨": // \ddot
      return "̈";
    case "⃗": // combining arrow
      return "→";
    default:
      return null;
  }
}

/**
 * `<mtable>` → matrix `<m:m>` or equation array `<m:eqArr>` (align). Caller may
 * supply surrounding fence operators to wrap the matrix in `<m:d>` delimiters.
 */
function convertMtable(node: MmlNode, fences: { beg: string; end: string } | null): string {
  const isAlign = isAlignTable(node);
  const rows = elementChildren(node).filter((r) => r.nodeName === "mtr");
  const rowsXml = rows
    .map((tr) => {
      const cells = elementChildren(tr).filter((c) => c.nodeName === "mtd");
      const cellsXml = cells.map(convertNode).join("");
      if (isAlign) {
        return `<m:e>${cellsXml}</m:e>`;
      }
      return `<m:mr>${cells.map((c) => `<m:e>${convertNode(c)}</m:e>`).join("")}</m:mr>`;
    })
    .join("");

  let inner: string;
  if (isAlign) {
    inner = `<m:eqArr>${rowsXml}</m:eqArr>`;
  } else {
    inner = `<m:m>${rowsXml}</m:m>`;
  }
  if (fences) {
    return (
      `<m:d><m:dPr><m:begChr m:val="${escapeXml(fences.beg)}"/>` +
      `<m:endChr m:val="${escapeXml(fences.end)}"/></m:dPr><m:e>${inner}</m:e></m:d>`
    );
  }
  return inner;
}

/** Align (aligned) tables get `displaystyle="true"`; cases/matrices do not. */
function isAlignTable(node: MmlNode): boolean {
  return attr(node, "displaystyle") === "true";
}

/** `<mfenced open="[" close="]">…</mfenced>` → `<m:d>` delimiters. */
function convertMfenced(node: MmlNode): string {
  const open = attr(node, "open") ?? "(";
  const close = attr(node, "close") ?? ")";
  const body = elementChildren(node).map(convertNode).join("");
  return (
    `<m:d><m:dPr><m:begChr m:val="${escapeXml(open)}"/>` +
    `<m:endChr m:val="${escapeXml(close)}"/></m:dPr><m:e>${body}</m:e></m:d>`
  );
}

/** `<menclose notation="…">` — best-effort: overline → acc, else text. */
function convertMenclose(node: MmlNode): string {
  const notation = attr(node, "notation") ?? "";
  const body = elementChildren(node).map(convertNode).join("");
  if (notation.includes("top") || notation.includes("overbar")) {
    return `<m:acc><m:accPr><m:chr m:val="‾"/></m:accPr><m:e>${body}</m:e></m:acc>`;
  }
  if (notation.includes("bottom") || notation.includes("underbar")) {
    return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${body}</m:e></m:bar>`;
  }
  // Unsupported enclosure (box, circle, …) → just keep the contents.
  return body;
}

/**
 * Some temml output uses sibling `<mo fence>` elements around an `<mtable>`
 * instead of `<mfenced>` (e.g. `\begin{pmatrix}`). Detect a leading/trailing
 * fence `<mo>` around a table and wrap the table in `<m:d>` delimiters.
 */
function maybeFencedTable(parent: MmlNode): string | null {
  const kids = elementChildren(parent);
  if (kids.length < 2) return null;
  const first = kids[0];
  const last = kids[kids.length - 1];
  if (!first || !last) return null;
  const firstFence = first.nodeName === "mo" && attr(first, "fence") === "true" && attr(first, "form") === "prefix";
  const lastFence = last.nodeName === "mo" && attr(last, "fence") === "true" && attr(last, "form") === "postfix";
  if (!firstFence || !lastFence) return null;
  const middle = kids.slice(1, -1);
  const beg = (first.textContent || "(").trim() || "(";
  const end = (last.textContent || ")").trim() || ")";
  // Single table in the middle → fenced matrix/cases.
  if (middle.length === 1 && middle[0].nodeName === "mtable") {
    return convertMtable(middle[0], { beg, end });
  }
  // Otherwise wrap whatever is between the fences in <m:d>.
  const body = middle.map(convertNode).join("");
  return (
    `<m:d><m:dPr><m:begChr m:val="${escapeXml(beg)}"/>` +
    `<m:endChr m:val="${escapeXml(end)}"/></m:dPr><m:e>${body}</m:e></m:d>`
  );
}

/** Parse a MathML string and emit `<m:oMath>…</m:oMath>`. Never throws. */
export function mathmlToOmml(mathml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(mathml, "application/xml");
    const root = doc.documentElement as unknown as MmlNode;
    if (!isElement(root)) {
      return `<m:oMath>${mathRun(decodeXml(stripTags(mathml)))}</m:oMath>`;
    }
    // Root <math>: detect fence-wrapped tables emitted by temml first.
    let body: string;
    if (root.nodeName === "math") {
      const fenced = maybeFencedTable(root);
      body = fenced !== null ? fenced : elementChildren(root).map(convertNode).join("");
    } else {
      body = convertNode(root);
    }
    return `<m:oMath>${body}</m:oMath>`;
  } catch {
    return `<m:oMath>${mathRun(decodeXml(stripTags(mathml)))}</m:oMath>`;
  }
}

/** Crude tag stripper for the ultimate fallback (keeps readable text). */
function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
