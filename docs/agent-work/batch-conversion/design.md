# 批量 Markdown → Word 转换

## 目标
在纯浏览器本地,把一个本地文件夹内的所有 `.md`/`.markdown` 文件批量转换成
`.docx`,保留原目录结构,失败文件跳过并记录。样式与单文件页完全一致。

## 形态
- 新增独立路由 `/batch`(`app/batch/page.tsx`)。
- 首页顶部加链接切换到批量页;批量页加链接回到首页。
- 单文件实时预览页(`app/page.tsx`)保持不动。

## 共享转换逻辑
- 抽取 `lib/convert.ts`:
  - `CONVERT_OPTIONS`(style / codeHighlighting / mathRendering / metadata 模板)
  - `buildConvertOptions(filename)`(metadata.title 用文件名)
  - `safeFilename(name)`(从首页迁移)
- `app/page.tsx` 改为 import 这两项,行为不变。
- `app/batch/page.tsx` 复用同一组选项 → 样式 100% 一致。

## 流程
```
<input type="file" webkitdirectory> 选文件夹(跨浏览器读取)
  ↓ 递归遍历,筛 .md/.markdown,记录相对路径
并发转换(信号量限制并发 = 3)
  ↓ 每文件 try/catch,失败标红 + 原因,不中断
输出:
  Chromium 支持 showDirectoryPicker → 按原目录结构写 .docx 到用户选的目录
  否则 → 用 jszip 打包成单个 zip(带目录结构)下载
```

## 关键决策
- **读取**: `webkitdirectory`(Chrome/Edge/Safari/Firefox 都支持读)。
- **写入**: Chromium 用 `File System Access API`(`showDirectoryPicker`)保留目录;
  其他浏览器降级为 zip(引入 `jszip`)。两种路径都保留目录结构。
- **并发**: 信号量限制 3,避免大量文件并发导致标签页 OOM。
- **失败处理**: 单文件失败 → 列表标红 + 错误原因,继续其余。批次结束显示
  「成功 X / 失败 Y / 跳过 Z(非 .md)」。
- **路径安全**: 相对路径规范化,拒绝 `..` 越界;文件名用 `safeFilename` 去非法字符。
- **远程图片**: 明确提示不嵌入 DOCX(与首页一致);data: 图片正常嵌入。

## 不做(YAGNI)
- 无进度条百分比,用「已处理 N/M」文字。
- 不暴露样式选项(完全复用首页样式)。
- 无队列暂停/恢复。
- 批量页不做预览(用户明确不需要)。

## 验证
- 建测试文件夹(中文名子目录、嵌套、一个故意写坏的 .md 触发失败)。
- 批量转换 → 确认:目录结构保留、中文/表格/公式在 DOCX、坏文件被跳过记录、无 OOM。
- unzip -t 检查生成的 DOCX。
- 桌面 1440×900 / 移动 390×844 布局检查批量页。
- 测试文件夹与生成的测试 DOCX 用完即删。

## 注意:output: export
项目现为静态导出。批量页所有逻辑纯客户端(File / File System Access / jszip),
不依赖服务端,静态导出完全可用。验证时 dev 用 `next dev`;静态产物在 `out/`。
