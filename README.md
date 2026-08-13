# Markdown to Word

一个纯浏览器运行的 Markdown 转 Word 网站。转换引擎直接使用
[`@mohtasham/md-to-docx`](https://github.com/MohtashamMurshid/md-to-docx)，不上传或存储用户文档。

## 功能

- 粘贴、编辑或拖拽上传 `.md` / `.markdown` 文件，实时预览
- **批量转换**：选择整个文件夹，把里面所有 Markdown 一次性转成 Word，
  保留原目录结构（详见 `/batch` 页）
- 支持 GFM 表格、标题、列表、引用、链接、代码块、公式和脚注
- 针对中文文档设置 Word 字体、字号、行距和标题层级
- 在浏览器本地生成并下载 `.docx`，内容不上传服务器
- 响应式桌面与移动端布局

## 本地运行

要求 Node.js 20+ 和 npm。

```bash
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。批量转换在
[http://localhost:3000/batch](http://localhost:3000/batch)。

项目为静态导出（`output: "export"`），生产构建产出纯静态文件：

```bash
npm run build      # 生成 out/ 目录
```

`out/` 可直接用任意静态服务器托管，例如 `npx serve out`。静态导出不提供
`next start` 服务。

## 部署

项目为纯前端静态导出，推荐 **GitHub + Cloudflare Pages** 组合：代码托管在 GitHub，
推送到 `main` 时由 GitHub Actions 自动构建并部署到 Cloudflare Pages。

### 自动部署（GitHub Actions，推荐）

仓库已包含 `.github/workflows/deploy.yml`。首次使用前需要在 GitHub 仓库的
**Settings → Secrets and variables → Actions** 配置两个 Secret：

| Secret | 说明 | 获取方式 |
|--------|------|----------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌 | Cloudflare 控制台 → My Profile → API Tokens → Create Token，使用 *Edit Cloudflare Workers* 模板，或自定义包含 **Cloudflare Pages: Edit** 权限的令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 账户 ID | Cloudflare 控制台任意域名概览页右侧，或 Workers 页面右侧 |

配置完成后，每次 `git push origin main` 都会触发：`npm ci` → `npm run build` →
`wrangler pages deploy out`。默认地址为 `https://md2word.pages.dev`。

> 首次部署时 wrangler 会自动创建名为 `md2word` 的 Pages 项目；若想提前在控制台手动
> 创建亦可。

### 本地手动部署

与自动部署等价的手动方式（需先执行 `npx wrangler login` 授权）：

```bash
npm run build
npx wrangler pages deploy out --project-name=md2word
```

### 其他平台

`out/` 是纯静态产物，也可用 Vercel、Netlify 等任意静态托管服务，Build Command 为
`npm run build`，输出目录 `out`，无需环境变量、数据库或服务端存储。

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
