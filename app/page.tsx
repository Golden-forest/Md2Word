"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadDocx } from "@mohtasham/md-to-docx";
import {
  Check,
  ChevronDown,
  Code2,
  Download,
  FileText,
  FolderTree,
  Languages,
  LoaderCircle,
  Printer,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { convertWithMath, safeFilename } from "@/lib/convert";
import { buildHtmlDocument } from "@/lib/htmlTemplate";
import { normalizeMathDelimiters } from "@/lib/normalizeMathDelimiters";
import { SAMPLE_MARKDOWN } from "@/lib/sample";

// Allow only safe raster image data URLs; reject svg (script/external-resource risk).
// http/https/mailto/relative URLs keep react-markdown's default behavior.
const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;

function urlTransform(value: string) {
  const src = (value ?? "").trim();
  if (src.startsWith("data:")) {
    // Allow only the explicitly safe raster MIME types; everything else (incl.
    // svg+xml) is neutralised to an empty string and handled by the img fallback.
    return SAFE_DATA_IMAGE.test(src) ? src : "";
  }
  return defaultUrlTransform(src);
}

type Locale = "zh" | "en";

const copy = {
  zh: {
    tagline: "本地转换，内容不离开浏览器",
    editor: "Markdown",
    preview: "实时预览",
    placeholder: "在这里粘贴或输入 Markdown...",
    previewEmpty: "预览区域为空,在左侧输入 Markdown 即可在此实时预览",
    previewEmptyHint: "或上传一个 .md 文件",
    drop: "拖放 .md 文件到这里",
    browse: "或点击选择文件",
    clear: "清空",
    sample: "载入示例",
    downloadMarkdown: "下载 Markdown",
    download: "下载 Word",
    converting: "正在生成",
    ready: "文档已下载",
    empty: "请先输入 Markdown 或上传文件。",
    invalid: "请选择 .md 或 .markdown 文件。",
    fileError: "无法读取该文件，请重试。",
    convertError: "生成 Word 失败，请检查 Markdown 内容后重试。",
    htmlError: "生成 HTML 失败，请重试。",
    formatWord: "Word 文档",
    formatPdf: "PDF",
    formatHtml: "HTML 网页",
    formatWordDesc: ".docx 可编辑",
    formatPdfDesc: "打印另存为 PDF",
    formatHtmlDesc: ".html 单文件网页",
    privacy: "文件仅在本地处理",
    remoteImage: "远程图片不会嵌入 Word；请使用 data: 图片。",
    words: "字符",
    madeWith: "转换能力由 @mohtasham/md-to-docx 提供",
    selectFile: "选择 Markdown 文件",
  },
  en: {
    tagline: "Local conversion. Your content stays in the browser.",
    editor: "Markdown",
    preview: "Live preview",
    placeholder: "Paste or write Markdown here...",
    previewEmpty: "Preview is empty. Type Markdown on the left and see it live here.",
    previewEmptyHint: "or upload a .md file",
    drop: "Drop a .md file here",
    browse: "or click to choose a file",
    clear: "Clear",
    sample: "Load sample",
    downloadMarkdown: "Download Markdown",
    download: "Download Word",
    converting: "Generating",
    ready: "Document downloaded",
    empty: "Enter some Markdown or upload a file first.",
    invalid: "Choose a .md or .markdown file.",
    fileError: "This file could not be read. Please try again.",
    convertError: "Word generation failed. Check the Markdown and try again.",
    htmlError: "HTML generation failed. Please try again.",
    formatWord: "Word document",
    formatPdf: "PDF",
    formatHtml: "HTML page",
    formatWordDesc: ".docx editable",
    formatPdfDesc: "print to PDF",
    formatHtmlDesc: ".html single file",
    privacy: "Files are processed locally",
    remoteImage: "Remote images are not embedded in Word; use data: images.",
    words: "characters",
    madeWith: "Conversion powered by @mohtasham/md-to-docx",
    selectFile: "Choose Markdown file",
  },
} as const;

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [markdown, setMarkdown] = useState("");
  const [filename, setFilename] = useState("markdown-document.docx");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [message, setMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const t = copy[locale];
  const previewMarkdown = useMemo(() => normalizeMathDelimiters(markdown), [markdown]);

  const disabled = !markdown.trim();

  // Close the format menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (splitRef.current && !splitRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const readFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (!/\.(md|markdown)$/i.test(file.name)) {
      setMessage(copy[locale].invalid);
      return;
    }
    try {
      setMarkdown(await file.text());
      setFilename(safeFilename(file.name));
      setMessage("");
    } catch {
      setMessage(copy[locale].fileError);
    }
  }, [locale]);

  const handleMarkdownDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.replace(/\.docx$/i, ".md");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrint = useCallback(() => {
    if (!markdown.trim()) {
      setMessage(t.empty);
      return;
    }
    // The printable area is .markdown-preview, isolated by @media print rules.
    window.print();
  }, [markdown, t.empty]);

  // Export the live preview DOM as a self-contained .html (inlined CSS + KaTeX).
  const handleHtmlDownload = useCallback(() => {
    if (!previewRef.current?.innerHTML?.trim()) {
      setMessage(t.empty);
      return;
    }
    try {
      const html = buildHtmlDocument(previewRef.current.innerHTML, filename.replace(/\.docx$/i, ""));
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename.replace(/\.docx$/i, ".html");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setMessage(t.htmlError);
    }
  }, [filename, t.empty, t.htmlError]);

  const handleDownload = async () => {
    if (!markdown.trim()) {
      setMessage(t.empty);
      return;
    }
    setStatus("working");
    setMessage("");
    try {
      const blob = await convertWithMath(markdown, filename);
      await downloadDocx(blob, filename);
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 2200);
    } catch (error) {
      console.error(error);
      setStatus("idle");
      setMessage(t.convertError);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">MW</span>
          <div>
            <strong>Markdown to Word</strong>
            <span>{t.tagline}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <a className="language-button" href="/batch" title={locale === "zh" ? "批量转换文件夹" : "Batch convert a folder"}>
            <FolderTree size={17} />
            <span>{locale === "zh" ? "批量" : "Batch"}</span>
          </a>
          <button
            className="language-button"
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            title={locale === "zh" ? "Switch to English" : "切换到中文"}
          >
            <Languages size={17} />
            <span>{locale === "zh" ? "中文" : "English"}</span>
            <ChevronDown size={14} />
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Markdown converter">
        <div className="pane editor-pane">
          <div className="pane-header">
            <div className="pane-title"><span className="status-dot" />{t.editor}</div>
            <div className="toolbar">
              <button className="tool-button" onClick={() => { setMarkdown(SAMPLE_MARKDOWN); setFilename("markdown-document.docx"); setMessage(""); }} title={t.sample}>
                <Sparkles size={16} /><span>{t.sample}</span>
              </button>
              <button className="tool-button" onClick={handleMarkdownDownload} disabled={!markdown} title={t.downloadMarkdown}>
                <Download size={16} /><span>{t.downloadMarkdown}</span>
              </button>
              <button className="tool-button" onClick={() => { setMarkdown(""); setMessage(""); }} disabled={!markdown} title={t.clear}>
                <RotateCcw size={16} /><span>{t.clear}</span>
              </button>
            </div>
          </div>

          <div
            className={`editor-wrap ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]); }}
          >
            <textarea
              value={markdown}
              onChange={(event) => { setMarkdown(event.target.value); setMessage(""); }}
              placeholder={t.placeholder}
              spellCheck={false}
              aria-label={t.editor}
            />
            {dragging && (
              <div className="drop-overlay">
                <span><Upload size={24} /></span>
                <strong>{t.drop}</strong>
                <small>{t.browse}</small>
              </div>
            )}
          </div>
          <div className="pane-footer">
            <button className="upload-button" onClick={() => inputRef.current?.click()}>
              <Upload size={16} /><span>{t.selectFile}</span>
            </button>
            <input ref={inputRef} type="file" accept=".md,.markdown,text/markdown" hidden onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            <span>{markdown.length.toLocaleString()} {t.words}</span>
          </div>
        </div>

        <div className="pane preview-pane">
          <div className="pane-header">
            <div className="pane-title"><span className="preview-icon" aria-hidden="true" />{t.preview}</div>
            <span className="privacy"><Check size={14} />{t.privacy}</span>
          </div>
          <article className="markdown-preview" ref={previewRef}>
            {markdown.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                urlTransform={urlTransform}
                components={{
                  img: ({ node: _node, src, alt, ...rest }) => {
                    // Guard against empty src (neutralised data URLs, broken URLs).
                    if (!src) {
                      return alt ? <span className="img-fallback">{alt}</span> : null;
                    }
                    return <img src={src} alt={alt ?? ""} {...rest} />;
                  },
                }}
              >
                {previewMarkdown}
              </ReactMarkdown>
            ) : (
              <div className="empty-state">
                <FileText size={30} />
                <p>{t.previewEmpty}</p>
                <small>{t.previewEmptyHint}</small>
              </div>
            )}
          </article>
          <div className="pane-footer remote-note">{t.remoteImage}</div>
        </div>
      </section>

      <section className="action-row">
        <div className="file-field">
          <FileText size={16} />
          <input value={filename} onChange={(event) => setFilename(safeFilename(event.target.value.replace(/\.docx$/i, "")))} aria-label="Word filename" />
        </div>
        <div className={`download-split ${menuOpen ? "is-open" : ""}`} ref={splitRef}>
          {menuOpen && (
            <div className="format-menu" role="menu">
              <button className="is-active" role="menuitem" onClick={() => { setMenuOpen(false); void handleDownload(); }} disabled={status === "working"}>
                <FileText size={17} />
                <span><span className="fmt-name">{t.formatWord}</span><span className="fmt-desc">{t.formatWordDesc}</span></span>
              </button>
              <button role="menuitem" onClick={() => { setMenuOpen(false); handlePrint(); }}>
                <Printer size={17} />
                <span><span className="fmt-name">{t.formatPdf}</span><span className="fmt-desc">{t.formatPdfDesc}</span></span>
              </button>
              <button role="menuitem" onClick={() => { setMenuOpen(false); handleHtmlDownload(); }}>
                <Code2 size={17} />
                <span><span className="fmt-name">{t.formatHtml}</span><span className="fmt-desc">{t.formatHtmlDesc}</span></span>
              </button>
            </div>
          )}
          <button className={`download-button ${status === "done" ? "is-done" : ""}`} onClick={() => void handleDownload()} disabled={disabled || status === "working"}>
            {status === "working" ? <LoaderCircle className="spin" size={19} /> : status === "done" ? <Check size={19} /> : <Download size={19} />}
            <span>{status === "working" ? t.converting : status === "done" ? t.ready : t.download}</span>
          </button>
          <button className="download-split-toggle" onClick={() => setMenuOpen((o) => !o)} disabled={disabled || status === "working"} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t.download}>
            <ChevronDown className="chevron" size={16} />
          </button>
        </div>
      </section>

      {message && <div className="toast" role="alert">{message}</div>}

      <footer>
        <span>{t.madeWith}</span>
        <a href="https://github.com/MohtashamMurshid/md-to-docx" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/MohtashamMurshid/md-to-docx/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT License</a>
      </footer>
    </main>
  );
}
