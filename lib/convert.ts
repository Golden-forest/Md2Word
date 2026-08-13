import type { Options } from "@mohtasham/md-to-docx";

// Shared by the single-file page and the batch page so styling is identical.

export function safeFilename(name: string) {
  const stem = name.replace(/\.(md|markdown)$/i, "").replace(/[\\/:*?\"<>|]/g, "-").trim();
  return `${stem || "document"}.docx`;
}

// Base options identical to the original handleDownload() call.
export function buildConvertOptions(filename: string): Options {
  return {
    documentType: "document",
    style: {
      fontFamily: "Microsoft YaHei",
      language: "zh-CN",
      paragraphSize: 22,
      listItemSize: 22,
      heading1Size: 32,
      heading2Size: 28,
      heading3Size: 26,
      heading4Size: 24,
      heading5Size: 22,
      heading6Size: 22,
      lineSpacing: 1.5,
      paragraphSpacing: 180,
      headingSpacing: 220,
      tableLayout: "autofit",
    },
    codeHighlighting: { enabled: true },
    mathRendering: { enabled: true, unsupported: "text" },
    metadata: { language: "zh-CN", title: filename.replace(/\.docx$/, "") },
  };
}
