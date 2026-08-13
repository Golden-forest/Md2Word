# Math rendering — temml + MathML→OMML post-processor

**Status:** Approved (2026-08-13)
**Goal:** Word output renders LaTeX formulas (`$...$` inline, `$$...$$` block) as **native, editable Word equations (OMML)** instead of raw source text.

## Problem

`@mohtasham/md-to-docx` ships a **hand-written, minimal TeX→OMML parser**
(`node_modules/@mohtasham/md-to-docx/dist/renderers/mathRenderer.js`, 208 lines).
It only supports: `\frac`, `\sqrt` (no degree), sub/superscripts, and ~40 symbol
commands in a `COMMAND_REPLACEMENTS` map (Greek letters, `\sum` `\int` `\times`
`\pm` `\leq` `\geq` `\neq` `\approx` `\infty` `\sin` `\cos` `\tan` `\log` `\ln` …).

Any command outside that set throws `Unsupported command \xxx`. With
`lib/convert.ts` setting `mathRendering.unsupported = "text"`, the fallback
(`modelToDocx.js:91-102`) inserts the **raw LaTeX source as plain text** into the
docx. Result: matrices (`\begin{pmatrix}`), cases, `\align`, accents
(`\vec \hat \bar \dot`), `\left/\right`, `\lim \partial \to \in \mathbb{R}`,
`\sqrt[3]{x}`, etc. all appear as literal `$...$` text in Word.

The browser preview renders fine because it uses KaTeX (a full LaTeX engine) via
`remark-math` + `rehype-katex` (`app/page.tsx:211-212`, `app/layout.tsx:2`).

## Verified facts (evidence)

- Project is `output: "export"` (`next.config.ts`) — **100% client-side**, no
  server runtime. All conversion runs in the browser.
- Both pages call `convertMarkdownToDocx(md, buildConvertOptions(name))` and share
  `lib/convert.ts`.
- The library is browser-safe (no Node `fs`/`path` in its entry).
- **Supported** math → library already emits correct `<m:oMath>` OMML
  (`<m:sSup>`, `<m:sSubSup>`, `<m:r>`, …). Confirmed by generating a docx.
- **Unsupported** math → library emits `<w:t xml:space="preserve">$\vec{F}=m\vec{a}$</w:t>`
  — a text run containing the **raw LaTeX with `$` delimiters**, XML-escaped
  (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`). This fallback is **unambiguous and
  locatable**. Confirmed by inspecting generated `word/document.xml`.
- `temml.renderToString(tex, { displayMode })` returns a Presentation MathML
  string; works in browser and Node. Bundle ~150 KB gzipped. Accepted as a new
  dependency.

## Approach (chosen: A)

Post-process the generated docx blob: locate fallback text runs, re-render their
LaTeX via `temml → MathML → our JS transformer → OMML XML`, replace those runs in
`word/document.xml`, re-zip. Do **not** touch the library or its already-correct
OMML.

Rejected: (B) Microsoft `MML2OMML.XSL` via a JS XSLT engine — engines are heavy
(1 MB+) and XSLT support in `@xmldom/xmldom` is incomplete/fragile. (C)
formula-as-image — contradicts the chosen editable-OMML requirement.

## Architecture

```
convertMarkdownToDocx(md, opts)        ← library, unchanged
      │ returns Blob (may contain $...$ fallback text)
      ▼
fixMathFallbacks(blob) → Blob          ← NEW, pure, in lib/
      ├─ JSZip.loadAsync(blob)
      ├─ read word/document.xml
      ├─ scan <w:t> text for $...$ / $$...$$ runs
      ├─ for each: temml → MathML → mathmlToOmml() → OMML XML
      ├─ rewrite that run in the XML
      └─ re-zip → new Blob
      ▼
downloadDocx(blob, name)               ← unchanged
```

A shared helper (e.g. `convertWithMath(md, name)` in `lib/convert.ts`) wraps
`convertMarkdownToDocx` + `fixMathFallbacks` so both pages get identical behavior.

## Components

### `lib/mathToOmml.ts` — MathML → OMML transformer (new)
- Input: a MathML string (from temml) OR a parsed MathML node tree.
- Output: an OMML XML string (`<m:oMath>…</m:oMath>`), or a `<m:r><m:t>…</m:t></m:r>`
  plain-text fallback for unsupported subtrees (per the silent-degradation rule).
- Pure function, no DOM/browser deps — string-in/string-out (or
  `@xmldom/xmldom`-parsed-in). Unit-testable in Node.
- A small MathML parser is needed (the project already has `@xmldom/xmldom`
  transitively via the docx lib; prefer `DOMParser` in-browser, but to stay
  Node-testable use a tiny hand parser or `@xmldom/xmldom`).

**MathML elements to cover (full coverage target):**

| MathML | OMML |
|--------|------|
| `<mfrac>` | `<m:f>` (num `<m:num>`, den `<m:den>`) |
| `<msqrt>` | `<m:rad>` (no deg) |
| `<mroot>` | `<m:rad>` (deg in `<m:deg>`) |
| `<msub>` `<msup>` `<msubsup>` | `<m:sSub>` `<m:sSup>` `<m:sSubSup>` |
| `<munder>` `<mover>` `<munderover>` | `<m:nary>`-style or `<m:limLow>`/`<m:limUpp>`; accents via `<m:acc>` |
| `<mtable>` `<mtr>` `<mtd>` | `<m:m>` (matrix) / `<m:eqArr>` (cases/align) |
| `<mrow>` | flatten into children |
| `<mo>` `<mi>` `<mn>` `<mtext>` | `<m:r><m:t>…</m:t></m:r>` |
| `<mfenced>` | `<m:d>` with delimiters |
| `<menclose>` `<mspace>` | best-effort/text fallback |
| unknown | text fallback (never throw) |

### `lib/fixMathFallbacks.ts` — docx post-processor (new)
- `fixMathFallbacks(blob: Blob): Promise<Blob>`.
- Loads the zip, rewrites `word/document.xml`, returns a new Blob.
- Locator: find `<w:t …>…</w:t>` runs whose decoded text contains `$`. Split such
  runs into (leading text) + (math) + (trailing text) segments; replace each math
  segment with its OMML, keep surrounding text as normal runs. **Always preserve
  the run's `<w:rPr>` formatting** so font/size/color match.
- `displayMode` derived from delimiter: `$$…$$` → block (`<m:oMathPara>`
  wrapper), `$…$` → inline (`<m:oMath>`).
- Decode XML entities in the captured LaTeX before passing to temml.

### `lib/convert.ts` — shared helper (modified)
- Add `convertWithMath(md, filename): Promise<Blob>` =
  `convertMarkdownToDocx(md, buildConvertOptions(filename))` then
  `fixMathFallbacks(blob)`.
- Keep `buildConvertOptions` / `safeFilename` unchanged.

### `app/page.tsx` & `app/batch/page.tsx` (modified)
- Replace the direct `convertMarkdownToDocx(text, …)` call with
  `convertWithMath(text, name)`. No other UI changes.

### Dependency
- Add `temml` (`npm install temml`).

## Data flow / error handling

- **Silent degradation:** if a sub-expression cannot be converted, emit its text
  as `<m:r><m:t>…</m:t></m:r>` — never throw. The whole document always succeeds.
- If temml itself throws on an expression, fall back to the original raw LaTeX
  text for that one expression (preserves current behavior for that run).
- If zip read/write fails, return the **original blob unchanged** (math fix is a
  best-effort enhancement, never blocks download).
- `fixMathFallbacks` must be idempotent and must **not** re-process real OMML
  (it only targets `<w:t>` text runs containing `$`).

## Testing

- **Unit (`lib/mathToOmml.test)`):** golden-output for each MathML element above;
  assert generated OMML contains expected `<m:f>` / `<m:rad>` / `<m:sSup>` /
  `<m:m>` / `<m:eqArr>` / `<m:acc>` etc. Use the project's existing
  `node scripts/...mjs` verification pattern (no test runner is configured; add a
  script under `scripts/` or light Vitest — decide at plan time).
- **Integration script (`scripts/verify-math.mjs`):** feed a Markdown doc with
  supported + unsupported formulas, run the full pipeline, unzip the result, and
  assert (a) no `<w:t>` run still contains `$\` raw math, and (b) `<m:oMath>`
  count ≥ number of formulas.
- **Verification command:** `npm run verify` (`tsc --noEmit && next build`).
- **Manual:** open the generated docx in Word/LibreOffice and confirm matrices,
  cases, `\vec`, `\int`, `\sqrt[3]{}` render as editable equations.

## Out of scope

- Replacing or forking `@mohtasham/md-to-docx`.
- Fixing the library's supported-subset OMML (it already works).
- Chemistry (`\ce{}` mhchem) unless temml's bundled plugins handle it.
- Changing the preview (KaTeX preview already correct).
