"use client";

import { useCallback, useRef, useState } from "react";
import { convertMarkdownToDocx } from "@mohtasham/md-to-docx";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FileText,
  FolderTree,
  Languages,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { buildConvertOptions, safeFilename } from "@/lib/convert";

type Locale = "zh" | "en";
type Status = "pending" | "ok" | "fail";

interface BatchItem {
  /** Path relative to the picked folder, using "/" separators. */
  relPath: string;
  /** Output .docx filename. */
  outName: string;
  file: File;
  status: Status;
  error?: string;
}

const copy = {
  zh: {
    title: "批量转换文件夹",
    tagline: "选择一个文件夹,把里面所有 Markdown 转成 Word",
    pickFolder: "选择文件夹",
    pickAnother: "重新选择",
    back: "返回单文件",
    summary: "共 {total} 个 Markdown,成功 {ok},失败 {fail}",
    doneFs: "已写入所选输出目录",
    doneZip: "已下载 zip 压缩包",
    pickOutput: "选择输出目录并保存",
    downloadZip: "下载为 zip",
    processing: "正在转换 {done}/{total}",
    empty: "没有找到 .md / .markdown 文件。",
    remoteNote: "远程图片不会嵌入 Word;请使用 data: 图片。",
    pickOutputHint: "将按原目录结构写入 .docx(仅 Chrome/Edge 等支持)",
    zipHint: "不支持直接写入目录时,打包成 zip 下载(保留目录结构)",
    unsupportedFs: "当前浏览器不支持直接写入文件夹,已改用 zip 下载。",
    fsCancelled: "未选择输出目录,已改为下载 zip。",
  },
  en: {
    title: "Batch Convert a Folder",
    tagline: "Pick a folder and convert every Markdown file into Word",
    pickFolder: "Choose folder",
    pickAnother: "Choose another",
    back: "Back to single file",
    summary: "{total} Markdown files, {ok} succeeded, {fail} failed",
    doneFs: "Written to the chosen output directory",
    doneZip: "Downloaded as a zip archive",
    pickOutput: "Choose output directory & save",
    downloadZip: "Download as zip",
    processing: "Converting {done}/{total}",
    empty: "No .md / .markdown files found.",
    remoteNote: "Remote images are not embedded in Word; use data: images.",
    pickOutputHint: "Writes .docx files preserving the original tree (Chrome/Edge)",
    zipHint: "When direct directory write is unavailable, pack into a zip (structure kept)",
    unsupportedFs: "This browser can't write to a folder directly; fell back to zip.",
    fsCancelled: "No output directory chosen; fell back to zip.",
  },
} as const;

const CONCURRENCY = 3;

/** Output file ready to be written to the file system or zipped. */
interface OutputFile {
  path: string;
  blob: Blob;
}

/** webkitRelativePath is non-standard but present on every browser that supports directory input. */
function relPathOf(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

/** Turn a relative path into a safe output path; reject traversal outside the root. */
function toOutputPath(relPath: string, outName: string): string {
  const dir = relPath.split("/").slice(0, -1).join("/");
  const parts = dir ? dir.split("/") : [];
  const cleaned: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") continue; // never allow escaping the root
    cleaned.push(p.replace(/[\\/:*?\"<>|]/g, "-"));
  }
  return [...cleaned, outName].join("/");
}

/** Simple semaphore to bound concurrent conversions. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, onProgress?: (done: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
      done++;
      onProgress?.(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export default function BatchPage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "converting" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const t = copy[locale];

  const updateItem = useCallback((index: number, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }, []);

  const pickFolder = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: BatchItem[] = [];
    for (const f of Array.from(fileList)) {
      if (!/\.(md|markdown)$/i.test(f.name)) continue;
      next.push({
        relPath: relPathOf(f),
        outName: safeFilename(f.name),
        file: f,
        status: "pending",
      });
    }
    setItems(next);
    setPhase("idle");
    setNotice(next.length === 0 ? t.empty : "");
    setProgress({ done: 0, total: next.length });
  }, [t.empty]);

  const convertAll = useCallback(async () => {
    if (items.length === 0 || phase === "converting") return;
    setPhase("converting");
    setNotice("");
    setProgress({ done: 0, total: items.length });
    setItems((prev) => prev.map((it) => ({ ...it, status: "pending", error: undefined })));

    const results = await mapWithConcurrency(
      items,
      CONCURRENCY,
      async (item, i): Promise<OutputFile | null> => {
        try {
          const text = await item.file.text();
          const blob = await convertMarkdownToDocx(text, buildConvertOptions(item.outName));
          updateItem(i, { status: "ok" });
          return { path: toOutputPath(item.relPath, item.outName), blob };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          updateItem(i, { status: "fail", error: reason });
          return null;
        }
      },
      (done) => setProgress({ done, total: items.length }),
    );

    const okResults = results.filter((b): b is OutputFile => b !== null);

    // Try File System Access API (write tree); otherwise fall back to zip.
    const canFs = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
    if (canFs) {
      try {
        const dirHandle = await (window as unknown as {
          showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
        }).showDirectoryPicker({ mode: "readwrite" });
        await writeTree(dirHandle, okResults);
        setPhase("done");
        setNotice(t.doneFs);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // user cancelled the directory picker -> fall back to zip
          await writeZip(okResults);
          setPhase("done");
          setNotice(`${t.fsCancelled} ${t.doneZip}`);
          return;
        }
        throw error;
      }
    }
    await writeZip(okResults);
    setPhase("done");
    setNotice(`${canFs ? "" : `${t.unsupportedFs} `}${t.doneZip}`);
  }, [items, phase, t]);

  const okCount = items.filter((i) => i.status === "ok").length;
  const failCount = items.filter((i) => i.status === "fail").length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><FolderTree size={20} strokeWidth={2.2} /></span>
          <div>
            <strong>{t.title}</strong>
            <span>{t.tagline}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <a className="language-button" href="/" title={t.back}>
            <FileText size={17} />
            <span>{t.back}</span>
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

      <section className="batch-dropzone" aria-label={t.title}>
        <input
          ref={inputRef}
          type="file"
          // @ts-expect-error -- webkitdirectory is non-standard but widely supported
          webkitdirectory=""
          directory=""
          multiple
          accept=".md,.markdown,text/markdown"
          hidden
          onChange={(event) => { void pickFolder(event.target.files); event.currentTarget.value = ""; }}
        />
        <button className="pick-folder-button" onClick={() => inputRef.current?.click()} disabled={phase === "converting"}>
          <Upload size={18} /><span>{items.length > 0 ? t.pickAnother : t.pickFolder}</span>
        </button>

        {items.length > 0 && (
          <div className="batch-controls">
            <button
              className="download-button"
              onClick={() => { void convertAll(); }}
              disabled={phase === "converting"}
            >
              {phase === "converting" ? <LoaderCircle className="spin" size={19} /> : phase === "done" ? <Check size={19} /> : <Download size={19} />}
              <span>{phase === "converting" ? t.processing.replace("{done}", String(progress.done)).replace("{total}", String(progress.total)) : t.pickOutput}</span>
            </button>
            {phase !== "converting" && <span className="batch-hint">{t.pickOutputHint}</span>}
          </div>
        )}

        <div className="batch-remote-note">{t.remoteNote}</div>
      </section>

      {notice && <div className="batch-notice" role="status">{notice}</div>}

      {items.length > 0 && (
        <section className="batch-list" aria-label="files">
          <div className="batch-summary">
            {t.summary.replace("{total}", String(items.length)).replace("{ok}", String(okCount)).replace("{fail}", String(failCount))}
          </div>
          <ul>
            {items.map((item, i) => (
              <li key={i} className={`batch-item is-${item.status}`}>
                <span className="batch-item-icon" aria-hidden="true">
                  {item.status === "ok" ? <Check size={15} /> : item.status === "fail" ? <CircleAlert size={15} /> : <FileText size={15} />}
                </span>
                <span className="batch-item-path" title={item.relPath}>{item.relPath}</span>
                {item.error && <span className="batch-item-error">{item.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        <span>{locale === "zh" ? "转换能力由 @mohtasham/md-to-docx 提供" : "Conversion powered by @mohtasham/md-to-docx"}</span>
        <a href="https://github.com/MohtashamMurshid/md-to-docx" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </main>
  );
}

/** Write each blob into dirHandle, creating intermediate directories. */
async function writeTree(root: FileSystemDirectoryHandle, files: OutputFile[]) {
  for (const { path, blob } of files) {
    const segments = path.split("/");
    let dir = root;
    for (const seg of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
    const fileHandle = await dir.getFileHandle(segments[segments.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
}

/** Pack all blobs into a zip preserving paths and trigger a download. */
async function writeZip(files: OutputFile[]) {
  const [{ default: JSZip }] = await Promise.all([import("jszip")]);
  const zip = new JSZip();
  for (const { path, blob } of files) {
    zip.file(path, blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = "markdown-to-word.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
