import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const tokens = new Set(JSON.parse(fs.readFileSync(
  path.join(rootDir, "src/color-tokens.json"), "utf8",
)))
const allowed = new Set([
  "color", "background-color", "background-image", "background-position",
  "background-position-x", "background-position-y", "background-size",
  "background-repeat", "background-origin", "background-clip",
  "background-attachment", "background-blend-mode", "border-color",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-block-color", "border-block-start-color", "border-block-end-color",
  "border-inline-color", "border-inline-start-color", "border-inline-end-color",
  "box-shadow", "outline-color", "scrollbar-color",
])
const forbidden = /^(?:width|height|(?:min|max)-.+|(?:inline|block)-size|aspect-ratio|padding(?:-.+)?|margin(?:-.+)?|inset(?:-.+)?|top|right|bottom|left|position|display|float|clear|flex(?:-.+)?|grid(?:-.+)?|order|gap|row-gap|column-gap|align-.+|justify-.+|place-.+|transform(?:-.+)?|translate|scale|rotate|zoom|perspective(?:-.+)?|font(?:-.+)?|line-height|letter-spacing|word-spacing|white-space(?:-.+)?|text-wrap(?:-.+)?|word-break|overflow(?:-.+)?|hyphens|text-indent|tab-size|cursor|z-index|pointer-events|touch-action|user-select|contain(?:-.+)?|container(?:-.+)?|isolation|mix-blend-mode|content-visibility|will-change|animation(?:-.+)?|transition(?:-.+)?|scroll-.+|overscroll-.+|scrollbar-width|content|all|appearance|color-scheme|accent-color|border(?:-.+)?|outline(?:-.+)?|clip(?:-.+)?|mask(?:-.+)?|opacity|filter|backdrop-filter|-webkit-backdrop-filter)$/

export function inspect(css, file = "<memory>") {
  const errors = []
  let ast
  try { ast = postcss.parse(css, { from: file }) }
  catch (e) { return [e.message] }
  const fail = (node, message) => errors.push(
    `${file}:${node.source?.start?.line ?? 0}: ${message}`,
  )
  ast.walkAtRules((node) => {
    if (!["media", "supports"].includes(node.name.toLowerCase()) || !node.nodes) {
      fail(node, `不允许 @${node.name}`)
    }
  })
  ast.walkRules((node) => {
    if (node.parent.type === "rule" || node.selector.includes("&")) fail(node, "不允许嵌套")
    if (/::(?:before|after)|:(?:before|after)\b/i.test(node.selector)) {
      fail(node, "首版不允许生成伪元素装饰层")
    }
  })
  ast.walkDecls((node) => {
    const p = node.prop.toLowerCase()
    if (node.parent.type !== "rule") fail(node, "声明必须在普通规则中")
    if (node.prop.includes("\\") || node.prop.startsWith("_") || node.prop.startsWith("*")) {
      fail(node, `转义或 hack 属性 ${node.prop}`)
    }
    if (node.prop.startsWith("--")) {
      if (!tokens.has(node.prop)) fail(node, `未审计变量 ${node.prop}`)
      const v = node.value.trim()
      const literal = /^(?:#[0-9a-f]{3,8}|transparent|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/+\-]+\))$/i
      const ref = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(v)
      if (!literal.test(v) && !(ref && tokens.has(ref[1]))) {
        fail(node, `变量不是颜色字面量或已审计引用：${node.prop}`)
      }
    } else if (!allowed.has(p)) {
      fail(node, `${forbidden.test(p) ? "黑名单" : "不在白名单"}属性 ${node.prop}`)
    }
    if (/\b(?:inherit|initial|unset|revert|revert-layer)\b/i.test(node.value)) {
      fail(node, "不允许通用重置值")
    }
    if (p === "background-clip" && /\btext\b/i.test(node.value)) fail(node, "不允许裁文字背景")
    for (const match of node.value.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      if (!tokens.has(match[1])) fail(node, `引用未审计变量 ${match[1]}`)
    }
    if (/url\(/i.test(node.value) && !/^url\("data:image\/svg\+xml,[^"\r\n]+"\)$/.test(node.value)) {
      fail(node, "首版只允许内嵌 SVG 图片 URL，不加载外部资源")
    }
  })
  return errors
}

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name)
    return item.isDirectory() ? cssFiles(full) : full.endsWith(".css") ? [full] : []
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = process.argv.slice(2)
  const files = inputs.length ? inputs.map((f) => path.resolve(f)) : cssFiles(path.join(rootDir, "src"))
  if (!files.length) throw new Error("没有 CSS 输入，拒绝空检查")
  const errors = files.flatMap((f) => inspect(fs.readFileSync(f, "utf8"), f))
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1 }
  else console.log(`CSS gate passed: ${files.length} file(s); runtime acceptance still required.`)
}
