// IMPORTANT: this is a JS template literal. LaTeX backslash commands MUST be
// written with a DOUBLE backslash (\\vec, \\frac, \\sum …). A single `\` starts
// a JS escape sequence — `\v`→U+000B (vertical tab), `\f`→U+000C, `\b`→U+0008
// — which corrupts the command into a control char (renders as a tofu box and
// breaks the formula). The code-fence backticks below stay escaped (\`) because
// they delimit the template. Regression-tested by scripts/verify-sample.mjs.
export const SAMPLE_MARKDOWN = `# Markdown 转 Word 测试文档

这是一份用于验证 **中文**、*English* 与中英文混排效果的完整示例。生成过程完全在浏览器本地完成。

## 文本格式 Text styles

普通段落包含 **粗体**、*斜体*、~~删除线~~、\`inline code\` 与 [OpenAI](https://openai.com) 链接。

> 好的文档不仅要内容准确，也要层次清晰、阅读舒适。

### 列表 Lists

- 无序列表项目一
- Mixed item with 中文
  - 嵌套项目

1. 第一步：输入 Markdown
2. 第二步：检查实时预览
3. 第三步：下载 Word 文档

#### 代码 Code

\`\`\`typescript
type Greeting = { name: string; language: "zh" | "en" };

export function greet({ name, language }: Greeting) {
  return language === "zh" ? \`你好，\${name}\` : \`Hello, \${name}\`;
}
\`\`\`

##### 数学公式 Math

行内公式：质能方程 $E = mc^2$，向量 $\\vec{F} = m\\vec{a}$，立方根 $\\sqrt[3]{x}$。

块级公式——求和：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

块级公式——积分：

$$
\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

块级公式——分段函数：

$$
\\begin{cases} x = 1 \\\\ y = 2 \\\\ z = 3 \\end{cases}
$$

块级公式——矩阵：

$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}
$$

块级公式——对齐方程组：

$$
\\begin{aligned} a &= b + c \\\\ d &= e - f \\end{aligned}
$$

###### 六级标题 Heading 6

脚注可以补充来源与解释。[^note]

[^note]: 这是一个包含中文的脚注示例。

## 图片 Image

![Markdown 标记示意图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAsElEQVR4nO3YsQ3CMBRA0UsGYQBGYARGYARGYBTOABUlpEiy4w+VrzvJkh35JMtXvV7XWmuXZT+e9R7AHRH4jgj4jgj4jgj4jgj4jgj4jgj4jgj4jgj4jgj4jgj4jgj4z+kBTdP0qfGcc667ruv6/fh6vV7Xdf3yDgC+BwDgOwAA3wMA8D0AAN8DAPA9AADfAwDwPQAA3wMA8D0AAN8DAPA9AADfAwDwPQAA3wMA8D0AAJ+zBzytDRY0EwdVAAAAAElFTkSuQmCC)

## GFM 表格

| 指标 Metric | 第一季度 Q1 | 第二季度 Q2 | 同比变化 YoY |
|:--|--:|--:|--:|
| 活跃用户 Active users | 12,480 | 15,320 | +22.8% |
| 转换文档 Documents | 31,206 | 42,118 | +35.0% |
| 平均耗时 Average | 1.8 s | 1.4 s | -22.2% |
| 成功率 Success rate | 98.7% | 99.3% | +0.6 pp |

| 城市 | 产品 A | 产品 B | 产品 C | 产品 D | 合计 |
|:--|--:|--:|--:|--:|--:|
| 北京 | 128 | 96 | 72 | 64 | 360 |
| 上海 | 142 | 105 | 88 | 70 | 405 |
| 深圳 | 119 | 112 | 91 | 83 | 405 |
| 成都 | 95 | 78 | 69 | 55 | 297 |
| 杭州 | 108 | 92 | 80 | 61 | 341 |
| 合计 | 592 | 483 | 400 | 333 | 1,808 |
`;
