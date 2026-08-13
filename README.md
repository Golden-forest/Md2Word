# Markdown to Word

一个纯浏览器运行的 Markdown 转 Word 网站。转换引擎直接使用
[`@mohtasham/md-to-docx`](https://github.com/MohtashamMurshid/md-to-docx)，不上传或存储用户文档。

## 功能

- 粘贴、编辑或拖拽上传 `.md` / `.markdown` 文件
- 支持 GFM 表格、标题、列表、引用、链接、代码块、公式和脚注
- 实时 Markdown 预览，中英文界面
- 针对中文文档设置 Word 字体、字号、行距和标题层级
- 在浏览器本地生成并下载 `.docx`
- 响应式桌面与移动端布局

## 本地运行

要求 Node.js 20+ 和 npm。

```bash
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。生产构建：

```bash
npm run build
npm start
```

## Vercel 部署

将仓库导入 Vercel 即可。框架选择 **Next.js**，Build Command 使用
`npm run build`，无需环境变量、数据库或服务端存储。

## 图片说明

上游转换库的浏览器构建不会抓取 HTTP(S) 远程图片，因为浏览器无法执行其服务端 SSRF
安全校验。预览可以显示远程图片，但导出的 Word 会显示回退文本。需要嵌入图片时，请在
Markdown 中使用 `data:` URL；示例文档包含一个可离线转换的内嵌图片。

## 转换与样式

生成流程为：

```text
Markdown -> @mohtasham/md-to-docx -> Blob -> browser download
```

正文默认使用 `Microsoft YaHei`，在未安装时由 Word/操作系统选择可用的中文字体回退。
代码高亮和原生 Word 数学公式均使用上游库的内置能力。

## 验证内容

页面内置的综合示例覆盖中文、中英文混排、Heading 1-6、粗体、斜体、列表、引用、链接、
data URL 图片、GFM 表格、代码块、数学公式和脚注，可用于快速执行完整转换检查。

## License

本项目采用 MIT License。转换引擎 `@mohtasham/md-to-docx` 的原始 MIT 版权声明见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
