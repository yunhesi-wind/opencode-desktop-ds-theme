# OpenCode Desktop 深海皮肤：只换视觉，绝不动布局

核查日期：2026-10-30。目标安装版本：Windows / Electron / OpenCode Desktop 2.2.3。

## 结论与实施边界

1. **首选官方 GUI 插件 `ctx.add(Style, css)`，不改安装目录，不碰 `app.asar`。** 插件只需 `./gui-experimental`，不必为换肤增加 server 部分。
2. 首个可交付版本使用“颜色令牌 + `html` 背景 + 半透明表面 + 阴影”。**默认不向任何官方元素新增 `filter`、`backdrop-filter`、`opacity`、`position` 或 `z-index`。** 玻璃质感不等于必须实时模糊。
3. 可选动态背景只在背景图片内部变化，不改变官方控件动画。以下骨架给出可直接使用的内嵌 SVG 背景，默认静态，尊重减少动态效果偏好。
4. `main(ctx).windows` 是官方已有能力，可以取得 `BrowserWindow` 并调用 Electron `webContents.insertCSS()`；这不是无法证实的窗口获取假设。但它仍依赖 GUI 入口先被桌面宿主加载，**不是“server 加载成功、GUI 不加载”的绕过方案**。
5. 官方 V2 主题 JSON 文档明确说主题属于终端客户端，选择项在 `cli.json`。没有核实到通过该 JSON 注册 Desktop 自定义皮肤的官方接口，不能把它作为第三条已可用方案。
6. 文档是当前线上 V2 契约，不是 2.2.3 的冻结规范。**2.2.3 本机是否实现这版 GUI SDK、Style、Store 和窗口 API，仍待运行时验证。** 不以 `loading plugin` 日志代替该验证。
7. 唯一发布依据是第 7 节在真实目标桌面窗口的前后 JSON 差异：零几何差异、零滚动差异、零命中差异、零焦点差异。此文档本身没有宣称已在用户窗口通过验收。

本次仅创建本文件。下列目录树和源码是后续实现时应创建的文件，并非已安装的插件；没有修改用户配置、旧主题或安装目录。

## 1. “零布局影响”的可执行定义

### 1.1 对比基线

在**同一个窗口、同一个路由、同一段内容、同一窗口尺寸、同一缩放、同一滚动位置、同一焦点、同一菜单/对话框状态**下对比。使用已加载、已注册 Settings 页的插件，仅切换皮肤开关，不在测量过程中安装/移除插件。

原因：新增 Settings 页必然让设置导航增加一个条目；不能一边要求提供新页，一边声称“未安装插件”和“安装插件后”的所有 DOM 完全相同。严格判据适用于**皮肤开关前后**的官方工作界面；Settings 扩展的注册成本单独列账。另做一次“未安装 / 已安装但皮肤关闭”的工作区对比，确保插件没有通过 Slot 等途径改变主界面。

前置条件：字体加载完成、模型停止输出、目录扫描结束、原生 UI 动画停止。不要为了测试注入全局 `animation:none`、`transition:none`、`overflow:hidden` 或修改字体；这些本身就违反约束。系统明暗模式保持一致；需要深色原生表单控件时，由用户在官方外观设置中选择深色，皮肤不擅改 `color-scheme`。

### 1.2 必须全部满足

| 对象 | 判据，允许误差均为 **0 CSS px** |
| --- | --- |
| 官方交互元素 | `getBoundingClientRect()` 的 x/y/top/right/bottom/left/width/height 完全一致；不四舍五入 |
| 官方其他元素 | 一并采集所有可访问元素的矩形，防止遗漏 div role=button、编辑器和自定义控件 |
| 滚动 | 文档和所有元素的 `scrollWidth/scrollHeight/clientWidth/clientHeight/scrollTop/scrollLeft` 完全一致，包括暂时没溢出的容器 |
| 命中 | 每个可见交互元素的中心和四个内侧采样点，`elementsFromPoint()` 的宿主元素链一致；同时对比影响命中的计算样式 |
| 键盘 | `tabindex`、disabled、hidden、inert、候选序列一致；**真实键盘 Tab / Shift+Tab 的焦点轨迹也一致** |
| 焦点 | 开关前后当前焦点不被抢走；禁止调用 `.focus()`、重排 tabIndex、拦截键盘、切换 inert |
| DOM | 工作区官方元素结构、属性和节点数量一致；允许宿主为 Style 管理的非交互 stylesheet 节点，不允许替换官方组件 |
| 状态 | hover/pressed/disabled/selected/focus 的逻辑与选择器仍由官方管理；只改它们消费的颜色令牌 |
| 定位/叠放 | 不改官方元素的 position/display/z-index/transform/contain/isolation/pointer-events，也不间接创建新包含块 |
| 可逆 | 关闭皮肤后恢复基线；窗口重载后、GUI 禁用后均无遗留背景或样式 |

矩形一致是必要条件，但不是充分条件：透明遮罩可能不改变任何矩形却挡住点击；`opacity:0` 元素依然可能可点击/可 Tab。仅截图或肉眼观察不是通过证据。

背景例外仅允许插件自有的无交互装饰层；它也不得改变文档滚动尺寸、官方节点命中或焦点。首版采用 html 背景，不使用这个 DOM 例外。

## 2. CSS 属性政策

### 2.1 默认白名单与条件白名单

| 属性 | 是否允许、为什么 |
| --- | --- |
| `color` | 允许；改变文字前景，不改字形度量。但要检查 currentColor 的 SVG/边框消费者是否保持可读 |
| `background-color/image/position/size/repeat/origin/clip/attachment/blend-mode` | 允许绘制用途；背景图片不是 img 替换元素，不提供布局固有尺寸。首版仅使用其中少数属性；禁止 `background-clip:text` 作为默认效果，避免文字消失 |
| `background` 简写 | 理论上不改盒模型，但会清空未声明的背景子属性、原生状态和渐变；默认扫描器拒绝，改用明确长属性 |
| `border-color`、各物理/逻辑方向 `border-*-color` | 允许；不改变边框宽度。只接受枚举属性，不用宽泛的 `border-*` 匹配 |
| `box-shadow` | 允许；是绘制/墨迹溢出，不增加边框盒，也通常不增加可滚动溢出。禁止用阴影伪造大面积遮挡；仍做滚动/命中验收 |
| `outline-color` | 允许；保留官方 outline 宽度、样式和偏移，不隐藏焦点 |
| `scrollbar-color` | 允许；只调颜色，不改 scrollbar-width 或滚动条伪元素尺寸 |
| CSS 自定义属性 | **只有经消费者审计的颜色令牌允许**，禁止笼统允许 `--*`。`--panel-width`、`--scale`、`--font-size` 同样可以改布局 |
| `backdrop-filter` / `-webkit-backdrop-filter` | 条件允许；非 none 可创建包含块及层叠上下文，不进入首版默认白名单。仅插件自有叶子装饰层，或已证明原生本来就有相同包含块/层叠边界的浮层，单独审核 |
| `filter` | 条件允许且更严格；影响整个元素及后代，可创建 fixed/absolute 包含块，禁止用于 body/#root/官方工作区祖先 |
| `opacity` | 只允许插件自有叶子装饰层；小于 1 创建层叠上下文/Backdrop Root，不让官方内容整体透明 |

**重要纠错：** 普通 HTML `outline` 不增加布局尺寸，通常也不扩大鼠标命中区域，不能声称它必然改变命中。拒绝 outline 简写的理由是它覆盖原生焦点环、可能产生视觉遮挡，并且不属于颜色-only；调试探针可临时使用，验收前撤销。真正改变 border-box 和常见命中尺寸的是 `border` 宽度。

### 2.2 黑名单：逐类原因

| 禁止的属性/类别 | 原因 |
| --- | --- |
| width/height/min-*/max-*；inline-size/block-size/aspect-ratio | 直接改变尺寸、约束和内在比例 |
| padding/margin/gap/row-gap/column-gap 及逻辑方向版本 | 改内容区、外部间距和布局间距 |
| inset/top/right/bottom/left；position | 改定位基准或位置；仅自有装饰层可例外 |
| display/float/clear | 改排版类型、文档流或元素存在性 |
| flex/flex-*、grid/grid-*、order、align-*、justify-*、place-* | 改布局分配、排列或顺序 |
| transform/translate/scale/rotate/zoom/perspective | 即使不重排普通流，也改变实际矩形、包含块或命中坐标 |
| font/font-family/font-weight/font-size/font-stretch/line-height/letter-spacing/word-spacing | 字体、粗细和字距都可能改变字形宽度、换行与行高，不仅 font-size 危险 |
| white-space/text-wrap/word-break/overflow-wrap/hyphens/text-indent/tab-size | 改换行、文本宽度或缩进 |
| overflow/overflow-x/overflow-y/overflow-block/overflow-inline | 改裁剪、滚动容器和滚动条尺寸；这些属性没有“只改颜色”的取值，颜色应使用 scrollbar-color |
| scrollbar-width、滚动条伪元素几何属性 | 改滚动条及可视区域宽度 |
| cursor/pointer-events/touch-action/user-select | 不一定改布局，但改变交互约定；仍禁止 |
| z-index/isolation/mix-blend-mode/contain/container-type/content-visibility/will-change | 改叠放、包含块、隔离或布局/绘制边界；不是无害的“性能优化” |
| border/border-width/border-style/border-image | 简写可能恢复默认宽度，none→solid 也可能让边框实际占宽；不允许 |
| border-radius/clip/clip-path/mask | 可能改点击形状、可见内容或层叠/Backdrop Root；不能借“纯视觉”跳过命中测试 |
| outline/outline-width/outline-style/outline-offset | 不是颜色-only，可能破坏原生焦点可见性；不当作布局尺寸属性解释 |
| appearance/color-scheme/accent-color | 可能触发原生控件不同绘制/度量或状态；首版不覆盖 |
| animation*/transition*/scroll-behavior/scroll-snap*/overscroll-behavior | 用户要求保留官方动画、滚动和焦点行为；禁止，即便动画只改颜色 |
| content/counters/list-style/all | 可以生成内容、更换标记或重置几何样式；禁止在官方元素上使用 |

### 2.3 构建期扫描器（可运行，不靠正则假装解析完整 CSS）

使用 PostCSS AST；未知属性一律报错，因此不仅列出的黑名单会失败。拒绝 @import、@font-face、@property、@keyframes、CSS 嵌套和转义属性名，避免绕过扫描。CSS 变量采用封闭令牌表，值只允许字面颜色或白名单变量引用。它是构建门禁，**不能替代消费者审计和第 7 节运行时验收**。

以下四个文件与第 6 节骨架配套，拷贝后可运行 `npm run check:css`。不配置装饰层通配豁免；首版没有装饰层几何 CSS。未来增加背景节点必须单独审核，不能通过改文件名逃过扫描。

`src/color-tokens.json`：

```json
[
  "--ds-skin-active",
  "--background-base", "--background-weak", "--background-strong", "--background-stronger",
  "--surface-base", "--surface-base-hover", "--surface-base-active",
  "--surface-raised-base", "--surface-raised-base-hover", "--surface-raised-base-active",
  "--surface-raised-strong", "--surface-raised-stronger", "--surface-raised-stronger-non-alpha",
  "--surface-float-base", "--surface-float-base-hover",
  "--input-base", "--input-hover", "--input-focus", "--input-active", "--input-selected",
  "--button-secondary-base", "--button-secondary-hover", "--button-ghost-hover", "--button-ghost-hover2",
  "--border-base", "--border-weak-base", "--border-strong-base", "--border-focus",
  "--text-base", "--text-weak", "--text-weaker", "--text-strong", "--text-stronger",
  "--icon-base", "--icon-weak", "--icon-strong",
  "--v2-background-bg-base", "--v2-background-bg-deep",
  "--v2-background-bg-layer-01", "--v2-background-bg-layer-02",
  "--v2-background-bg-layer-03", "--v2-background-bg-layer-04",
  "--v2-text-text-base", "--v2-text-text-muted", "--v2-text-text-faint",
  "--v2-icon-icon-base", "--v2-icon-icon-muted", "--v2-icon-icon-faint",
  "--v2-border-border-base", "--v2-border-border-muted", "--v2-border-border-strong",
  "--v2-overlay-simple-overlay-scrim"
]
```

这些名字来自旧 CSS 的既有颜色声明，不是对 2.2.3 DOM/令牌契约的永久保证。每次升级要核查这些变量的所有消费者只用于颜色；无法核查的变量删掉，必要时改成已核实组件上的 background-color/color。探针 `--ds-skin-active` 只供检测，不给任何官方几何属性使用。

`scripts/check-css.mjs`：

```js
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

export function inspect(css, file = "<内存>") {
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
  else console.log(`CSS 门禁通过：${files.length} 个文件；仍须执行桌面运行时验收。`)
}
```

说明：扫描器使用显式枚举处理 border/outline 颜色，先匹配允许项再报黑名单，不会误伤 `border-bottom-color`。背景 SVG 内部可以有其自身图形坐标，不是给官方 DOM 写 CSS 几何属性。扫描器不是恶意输入沙箱，发布代码中禁止额外 JS 写几何样式、插入未检查的 CSS 或修改令牌表绕过审核。

`scripts/check-css.test.mjs`：

```js
import assert from "node:assert/strict"
import { inspect } from "./check-css.mjs"
assert.equal(inspect("body{color:#fff;border-bottom-color:#123;box-shadow:0 2px 8px #000}").length, 0)
assert.equal(inspect(":root{--text-base:rgba(1,2,3,.5)}").length, 0)
for (const css of [
  "button{width:10px}", "button{padding:1px}", "body{border:1px solid red}",
  "body{outline:1px solid red}", "body{backdrop-filter:blur(1px)}", "body{opacity:.9}",
  ":root{--panel-width:300px}", ":root{--text-base:12px}",
  "body{background-color:var(--panel-width)}", "@import 'x.css';", "body{display:block}",
  "@keyframes x{to{color:red}}", "body{scrollbar-width:thin}", "body{cursor:pointer}",
]) assert.ok(inspect(css).length, `应拒绝：${css}`)
console.log("CSS 门禁回归测试通过")
```

## 3. 背景层：不进入文档流，也不碰官方叠放

### 3.1 首选：直接绘制 html 背景

第 6 节代码采用此路线。background-image 不创建元素、不改变文档流、不形成新命中目标，也不会因图片本身创建滚动条。不使用 `100vw`（可能包括滚动条宽度），不改 body 高度，不用 transform。

html 的背景作为画布背景绘制；明确设置不透明 background-color，避免依赖 body 背景传播。body/#root 只改 background-color 为透明；如果目标版本还在它们上面绘制不透明 background-image，应定位并只清除那一张原生背景，不用 `*{background:transparent}` 暴力穿透。

如果某个官方表面仍然不透明，背景被遮住是正常绘制结果，不是 Style 没加载。优先改该表面确实消费的颜色令牌；不可通过提高背景 z-index“解决”。

动态背景使用作为图片加载的 SVG，动画在图像内部运行，官方 DOM 没有新增动画属性。Electron 的实际 Chromium/CSP 是否允许 data:image/svg+xml 和 SMIL，**需实测**；失败时退回已存在的静态渐变，不破解 CSP。

### 3.2 次选：固定背景节点（本节可独立在受控实验页使用，首版不启用）

```js
function mountDecorativeBackground(image) {
  if (document.getElementById("ds-skin-background")) throw new Error("背景 ID 已被占用")
  const node = document.createElement("div")
  node.id = "ds-skin-background"
  node.setAttribute("aria-hidden", "true")
  node.inert = true
  Object.assign(node.style, {
    position: "fixed", inset: "0px", zIndex: "-1", pointerEvents: "none",
    backgroundImage: image, backgroundSize: "cover", backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  })
  document.body.append(node)
  return () => node.remove()
}
```

为什么选 div：它是非替换元素，fixed + 四边 inset 即可覆盖包含块，不需要宽高。video 是替换元素，不能简单套用这一假设；需要额外尺寸和 object-fit，故不放入首版。

必要前提与风险：

- fixed 脱离普通文档流；但**fixed 并非无条件相对视口**。body 或其祖先存在 transform/filter/backdrop-filter/contain 等时，可能更换包含块、跟随滚动或产生溢出。前后滚动尺寸和矩形验收必须覆盖它，不能只靠这段 CSS 保证。
- pointer-events:none 只保证此层不成为指针目标；aria-hidden、inert、无 tabIndex/无子控件共同避免辅助技术和键盘入口。
- z-index:-1 可能被 body 自己的不透明背景或其他叠放层遮住。禁止为使其可见给 body 加 position、z-index、isolation 或给官方根节点提层。
- 新增节点会影响 `:last-child`、`:nth-last-child`、`:has()` 等选择器；因此即使 fixed 不参与流，也可能**间接改布局**。选择 html 背景正是为了消除这项风险。
- 不写 overflow:hidden 来掩盖溢出；一旦产生新滚动条，直接拒绝此实现。
- 上述 JS 是单独审核的装饰层例外，不纳入颜色 CSS 文件；不能以此豁免官方容器几何修改。

### 3.3 `body::before` 与 html 背景的差异

`body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none}` 不新增 DOM 节点，但会新增一个生成盒。若官方已使用 body::before，会覆盖官方样式；仍可能被祖先包含块、裁剪与背景遮住。伪元素不能直接承载 video；它的 pointer-events、content、定位规则也不属于颜色-only。不要为伪元素添加新的 body stacking context。**不新增节点不等于不新增布局影响。**

html 背景没有额外生成盒，无命中和层叠管理，最适合“零布局影响”的硬约束。代价是被不透明面板遮挡，需要精准颜色适配，且无法直接播放视频。静态壁纸可以构建时转 data URI；首版给出无外部资源的 SVG 动态背景，不提供任意远程 URL。

## 4. 玻璃/模糊：包含块风险和 GPU 成本

Filter Effects Level 2 草案明确写明：`backdrop-filter` 非 none 会创建层叠上下文，并为 absolute/fixed 后代建立包含块（当前浏览上下文文档根元素有例外）。`filter` 同样存在此类风险。即使 `blur(0)` 或 `brightness(1)` 看起来没变化，**它们仍然不是 none**。浏览器实际行为需以 2.2.3 内置 Chromium 实测为准，不能只凭最新规范推定版本实现。

因此禁止对 body、#root、整窗、session 容器、滚动时间线以及含 fixed/absolute 浮层后代的官方祖先批量加模糊。旧 CSS 对 dock、session 标题和消息气泡的 blur 不能整段搬运进“零布局”版本。

建议分级：

- **严格模式（默认、可交付）**：RGBA 背景 + 渐变 + 阴影；无新增实时滤镜；菜单/对话框沿用官方已有滤镜和几何。
- **增强模式（待目标页面验证）**：只在官方原本已经建立相同包含块/叠放边界的菜单/对话框表面调滤镜参数；必须覆盖子菜单、tooltip、输入候选、拖动、滚动与窗口缩放。若原生值是 none，不直接新增。
- **自有装饰层模糊**：叶子层没有官方后代，滤镜不会重新定位官方 fixed 子元素；仍审核叠放、CSP、渲染与命中。不能为了做这层给官方容器加 position:relative。

运行时只读排查当前浮层（不是自动批准模糊）：

```js
console.table([...document.querySelectorAll(
  '[data-component="menu-v2-content"], [data-component="dialog-v2"] [data-slot="dialog-container"]',
)].map((el) => ({
  element: el,
  backdrop: getComputedStyle(el).backdropFilter,
  filter: getComputedStyle(el).filter,
  descendants: [...el.querySelectorAll("*")].filter((child) =>
    ["fixed", "absolute"].includes(getComputedStyle(child).position),
  ).length,
})))
```

性能限制：面积、半径、叠层数量和每秒背景变化量共同决定成本；实现可能分配离屏纹理、增加合成层、采样和 GPU 内存/带宽，不保证每次一层且不保证硬件加速。1920×1080 RGBA 单张缓冲约 7.9 MiB；DPR=2 约 31.6 MiB，实际常需多张缓冲。建议模糊局限在可见的小浮层、半径 8–12px，不叠多个全屏模糊，不常驻 will-change。用 DevTools Performance/Layers 对比滚动、开菜单、窗口缩放；动态背景默认关，低功耗/减少动态效果时回退静态。掉帧或合成异常优先去模糊，不修改官方动画或滚动策略补救。

## 5. 注入途径，按可靠性排序

### 5.1 第一：GUI `setup(ctx)` → `ctx.add(Style, css)`

**可行，官方明确提供。** `setup` 每个桌面窗口运行；Style 贡献激活期间注入，取消贡献或禁用 GUI 自动回收。采用 Vite 官方 `gui()` 预设，入口必须是已构建的单文件 CJS，exports 必须指向它。

失效点：

1. 本机 2.2.3 未提供当前 experimental SDK/Style；需要运行日志与导出诊断，不猜测兼容性。
2. 只加载了 server 部分；GUI 导出缺失、输出文件不存在、扩展名不是 .js/.cjs、导出冲突/保留命名空间、GUI 被用户关闭。
3. 插件配置来自某个会话连接的远程/项目 server，而不是 Desktop 自己的 background server；官方 GUI 发现来源是后者。需最终由用户在全局 opencode.json(c) 登记，但本任务不做配置修改。
4. CJS 分包、未知 shared import、Solid/Effect 被错误打包，导致 renderer 加载失败。采用官方预设，不手工 external 一切。
5. Style 已进入窗口但被原生规则覆盖、令牌不再消费、背景被不透明层遮住、iframe/Shadow DOM 边界导致匹配不到。

自检分层：

- 在 **Settings > Extensions > Plugins** 看 GUI 是否 loaded/enabled，不仅看 server 日志。
- main 记录 ctx.app.version；setup 输出 `[ds-skin] setup`（见骨架），分别证明进程已运行。GUI 初始化抛错不能吞掉。
- 开启皮肤后，在目标窗口 DevTools 执行：

```js
({
  probe: getComputedStyle(document.documentElement).getPropertyValue("--ds-skin-active").trim(),
  htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
  bodyBackground: getComputedStyle(document.body).backgroundColor,
  location: location.href,
})
```

probe 期望 `#010203`。为此颜色探针使用 `!important`，关闭后应消失或恢复原值。探针存在仅证明这条 CSS 生效，**不证明所有组件都换色**。接着检查实际浮层/表面的 backgroundColor 和令牌消费者。

必要时临时追加 `body{outline:1px solid red!important}` 做可视探针；它不是发布 CSS，且不能证明布局或焦点安全。优先使用上述无绘制影响的私有变量探针，不把 red outline 留进验收结果。

### 5.2 第二：GUI `main(ctx)` → Electron `webContents.insertCSS()`

**可行；所需官方 API 已核实：** `ctx.windows.list/get/focused/on("open"|"close")` 返回真实 BrowserWindow；随后使用 `.webContents`。setup 中 Electron 是 inert placeholder，不能在 setup 里假装拿到真实 Electron。server `setup` 没有该窗口能力，也不要用 remote/扫描进程/篡改 preload 获取窗口。

适用：GUI main 已工作，Style 贡献路径确有问题，需要受控的诊断后备。可靠性低于 Style，需自己处理全窗口、首次已加载、后续窗口、导航、异步注入竞争、卸载回收。**不能和 Style 同时启用。** 保持 `cssOrigin:"author"`，不要用 user origin 和全局 important 强压原生状态。

以下是可直接放入 `src/main-css.ts` 的完整静态后备，实现不依赖额外 Electron runtime import；类型为纯 type import，支持现有与后续窗口、导航和禁用回收。只用于独立后备构建；不要保留原 setup 或其皮肤开关，以免开关状态与 main 注入不同步。GUI 的官方总开关仍能卸载后备。

```ts
import type { BrowserWindow } from "electron"
import type { Plugin } from "@opencode/plugin/gui"
import css from "./theme.css?inline"

export const mainCSS: Plugin.MainSetup = (ctx) => {
  if (!ctx.windows || typeof ctx.windows.list !== "function") {
    throw new Error("当前宿主没有官方 GUI main windows API，停止后备注入")
  }
  let stopped = false
  const releases = new Map<number, () => Promise<void>>()
  const attach = (window: BrowserWindow) => {
    if (stopped || window.isDestroyed() || releases.has(window.id)) return
    const wc = window.webContents
    let disposed = false
    let generation = 0
    let key: string | undefined
    let queue: Promise<void> = Promise.resolve()
    const report = (error: unknown) => ctx.log.write("error", "ds skin CSS 后备失败", {
      window: window.id, error: String(error),
    })
    const remove = async (value: string | undefined) => {
      if (value && !wc.isDestroyed()) {
        try { await wc.removeInsertedCSS(value) }
        catch (error) { if (!wc.isDestroyed()) report(error) }
      }
    }
    const schedule = () => {
      const expected = ++generation
      queue = queue.then(async () => {
        if (disposed || stopped || wc.isDestroyed() || expected !== generation) return
        const old = key
        key = undefined
        await remove(old)
        if (disposed || stopped || wc.isDestroyed() || expected !== generation) return
        const inserted = await wc.insertCSS(css, { cssOrigin: "author" })
        if (disposed || stopped || wc.isDestroyed() || expected !== generation) {
          await remove(inserted)
          return
        }
        key = inserted
        const probe = await wc.executeJavaScript(
          'getComputedStyle(document.documentElement).getPropertyValue("--ds-skin-active").trim()',
        )
        ctx.log.write(probe === "#010203" ? "info" : "warn", "ds skin CSS 后备探针", {
          window: window.id, probe: String(probe),
        })
      }).catch(report)
    }
    const onNavigation = () => { ++generation }
    wc.on("did-start-navigation", onNavigation)
    wc.on("did-finish-load", schedule)
    if (!wc.isLoadingMainFrame()) schedule()
    const release = async () => {
      if (disposed) return
      disposed = true
      ++generation
      if (!wc.isDestroyed()) {
        wc.removeListener("did-start-navigation", onNavigation)
        wc.removeListener("did-finish-load", schedule)
      }
      await queue
      const old = key
      key = undefined
      await remove(old)
      releases.delete(window.id)
    }
    releases.set(window.id, release)
  }
  ctx.windows.list().forEach(attach)
  const stopOpen = ctx.windows.on("open", attach)
  const stopClose = ctx.windows.on("close", (window) => { void releases.get(window.id)?.() })
  return async () => {
    stopped = true
    await stopOpen()
    await stopClose()
    await Promise.all([...releases.values()].map((release) => release()))
  }
}
```

后备构建专用的完整 `src/gui.tsx`（替换主方案入口，不与其并用）：

```tsx
import { Plugin } from "@opencode/plugin/gui"
import { mainCSS } from "./main-css"

export default Plugin.define({ main: mainCSS })
```

失效点：同一个 GUI 入口压根没加载、windows 能力缺失、目标不是该 webContents、页面导航清掉注入、SDK 版本不兼容、样式匹配/层叠问题。insertCSS 返回 key 只证明注入请求成功，必须继续检查 computedStyle。只在 app 窗口使用官方 ctx.windows，不用全局 getAllWebContents 将 CSS 注入外部站点、浏览器嵌入和 DevTools。

注：上述后备只保证静态 CSS。主方案的“动态背景”和 Store 开关属于 renderer 路线，不能不加 IPC 就假装两者共享状态。

### 5.3 第三：其他官方方式——目前无经证实的等价桌面方案

| 方式 | 核实结果 |
| --- | --- |
| Desktop 官方 Settings > Appearance | GUI 文档确认能选明/暗/系统；不等于支持自定义背景/任意 CSS |
| `ctx.appearance.mode()` | 已公开的是只读 light/dark accessor；文档没有注册桌面原生主题的接口 |
| V2 `themes/*.json`、`cli.json.theme` | 官方 Themes 明确属于 terminal client；不能声称它会给 Desktop 换肤 |
| 任意 `opencode.jsonc.theme` 或臆造 Theme registry | 不提出，未获 V2 文档支持 |
| 再改 app.asar / preload / 安装目录注入 | 非本方案，更新不稳定且用户已放弃 |

所以第三条不是“已知一定能用的后备”。如果 2.2.3 确认没有兼容 GUI API，就应停止、报告版本不支持，等待官方兼容版本/接口；不能用“看起来加载了”的日志掩盖能力缺失。

## 6. 可直接构建的首版骨架

### 6.1 文件树与包入口

```text
opencode桌面端ds美化-plugin/
├─ DESIGN.md
├─ package.json
├─ package-lock.json             # 首次安装生成，评审后提交锁文件
├─ vite.config.ts
├─ tsconfig.json
├─ scripts/
│  ├─ check-css.mjs              # 第 2.3 节
│  ├─ check-css.test.mjs         # 第 2.3 节
│  └─ make-background.mjs
├─ src/
│  ├─ color-tokens.json          # 第 2.3 节
│  ├─ gui.tsx
│  ├─ theme.css
│  └─ background.generated.css   # 构建时生成；同样经过 CSS 检查
└─ dist/
   └─ gui-experimental.cjs
```

`package.json`：

```json
{
  "name": "ds-deepsea-skin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { "./gui-experimental": "./dist/gui-experimental.cjs" },
  "files": ["dist"],
  "scripts": {
    "generate": "node scripts/make-background.mjs",
    "check:css": "node scripts/check-css.mjs",
    "test": "node scripts/check-css.test.mjs",
    "typecheck": "tsc --noEmit",
    "build": "npm run generate && npm run check:css && npm test && npm run typecheck && vite build",
    "dev": "npm run generate && npm run check:css && vite build --watch"
  },
  "dependencies": { "@opencode/plugin": "latest" },
  "devDependencies": {
    "effect": "^3.0.0",
    "solid-js": "^1.9.0",
    "vite": "^7.0.0",
    "vite-plugin-solid": "^2.11.0",
    "typescript": "^5.9.0",
    "postcss": "^8.5.0"
  }
}
```

GUI-only 包没有 `.` server export 是官方允许的。无需创建一个可能失败的空 server 部分。包名避开 opencode 保留命名空间；SDK 类型来自 @opencode/plugin，Effect/Solid 实例由宿主共享，官方 Vite 预设会 external 它们。

这里 latest 只是与官方示例一致的**发现版本**，不是 2.2.3 兼容声明。首次安装后要核对该 SDK 的 GUI 导出，固定实际验证通过的精确版本并提交 lockfile；发布前禁止静默追新。若安装出来的 SDK 不含 `/gui` 或 `/gui/vite`，构建失败应直接暴露，不换用 V1 API。

可选 main 后备才需要 `npm install -D electron @types/node`，可设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 只获取类型，不需要运行另一套 Electron。此操作是实现阶段建议，本任务不执行安装。

`vite.config.ts`：

```ts
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

export default defineConfig({
  plugins: [gui({ entry: "src/gui.tsx", outFile: "dist/gui-experimental.cjs" })],
})
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

### 6.2 `src/gui.tsx`：开关、Settings 页、生命周期

```tsx
import { Schema } from "effect"
import { createSignal } from "solid-js"
import { Plugin, SettingsPage, Store, Style } from "@opencode/plugin/gui"
import css from "./theme.css?inline"
import motionCSS from "./background.generated.css?inline"

const definition = Plugin.define({
  stores: {
    prefs: Store.global(
      Schema.Struct({ enabled: Schema.Boolean, motion: Schema.Boolean }),
      { enabled: true, motion: false },
    ),
  },
})

export default Plugin.define({
  ...definition,
  setup(ctx) {
    console.info("[ds-skin] setup", {
      id: ctx.id, version: ctx.app.version, platform: ctx.app.platform,
    })
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const [reduced, setReduced] = createSignal(media.matches)
    const onReduced = () => setReduced(media.matches)
    media.addEventListener("change", onReduced)
    const prefs = ctx.stores.prefs

    ctx.add(Style, () => {
      if (!prefs.value.enabled) return undefined
      return css + (prefs.value.motion && !reduced() ? motionCSS : "")
    })

    ctx.add(SettingsPage, {
      id: "deepsea-skin",
      title: "深海皮肤",
      entries: [
        { id: "enabled", title: "启用深海皮肤", keywords: "深蓝 玻璃 颜色" },
        { id: "motion", title: "动态背景", keywords: "动态 静态 减少动态效果" },
      ],
      render: () => (
        <section aria-label="深海皮肤设置">
          <h2>深海皮肤</h2>
          <label>
            <input type="checkbox" checked={prefs.value.enabled} onChange={(event) => {
              prefs.update((draft) => { draft.enabled = event.currentTarget.checked })
            }} />
            启用颜色皮肤
          </label>
          <label>
            <input type="checkbox" checked={prefs.value.motion} onChange={(event) => {
              prefs.update((draft) => { draft.motion = event.currentTarget.checked })
            }} />
            动态背景（系统要求减少动态效果时不播放）
          </label>
          <p>只改配色和背景，不新增工作区按钮、面板或快捷键。</p>
          <p>严格模式不向官方容器添加模糊。关闭皮肤可恢复官方绘制。</p>
        </section>
      ),
    })

    return () => media.removeEventListener("change", onReduced)
  },
  main(ctx) {
    ctx.log.write("info", "ds-skin GUI main 已启动", { version: ctx.app.version })
  },
})
```

不用 Command/Slot/Panel/TitlebarItem 新增官方工作区控件；不绑定快捷键，不设 tabIndex，不改焦点。设置页中的新增 UI 是明确的扩展界面，非对官方控件的几何覆盖。ctx.add 的注册由宿主随插件卸载；只对自己添加的 matchMedia 监听器手动清理。函数式 Style 贡献返回 undefined 是官方支持的撤回机制，不手工移除他人的 style 标签。

### 6.3 `src/theme.css`：先做最小安全令牌集

```css
:root {
  --ds-skin-active: #010203 !important;
  --background-base: transparent;
  --background-weak: rgba(13, 23, 42, 0.78);
  --background-strong: rgba(13, 23, 42, 0.92);
  --background-stronger: rgba(13, 23, 42, 0.98);
  --surface-base: rgba(134, 178, 243, 0.06);
  --surface-base-hover: rgba(134, 178, 243, 0.12);
  --surface-base-active: rgba(134, 178, 243, 0.20);
  --surface-raised-base: rgba(16, 28, 49, 0.92);
  --surface-raised-base-hover: rgba(43, 64, 95, 0.96);
  --surface-raised-base-active: rgba(55, 78, 112, 0.98);
  --surface-raised-strong: rgba(16, 28, 49, 0.96);
  --surface-raised-stronger: rgba(12, 23, 42, 0.88);
  --surface-raised-stronger-non-alpha: #101e33;
  --surface-float-base: #101c31;
  --surface-float-base-hover: #1b2d47;
  --input-base: rgba(16, 28, 49, 0.90);
  --input-hover: rgba(24, 38, 62, 0.94);
  --input-focus: rgba(24, 38, 62, 0.98);
  --input-active: #182b46;
  --input-selected: #294568;
  --button-secondary-base: #14233a;
  --button-secondary-hover: #223955;
  --button-ghost-hover: rgba(134, 178, 243, 0.12);
  --button-ghost-hover2: rgba(134, 178, 243, 0.20);
  --border-base: rgba(171, 196, 232, 0.18);
  --border-weak-base: rgba(171, 196, 232, 0.12);
  --border-strong-base: rgba(171, 196, 232, 0.40);
  --border-focus: #8db8ff;
  --text-base: #c4d0e3;
  --text-weak: #a9bad1;
  --text-weaker: #8a9cb5;
  --text-strong: #eaf1fd;
  --text-stronger: #f1f6ff;
  --icon-base: #c4d0e3;
  --icon-weak: #a9bad1;
  --icon-strong: #eaf1fd;
  --v2-background-bg-base: transparent;
  --v2-background-bg-deep: rgba(8, 15, 29, 0.52);
  --v2-background-bg-layer-01: rgba(13, 23, 42, 0.80);
  --v2-background-bg-layer-02: rgba(16, 28, 49, 0.93);
  --v2-background-bg-layer-03: rgba(24, 38, 62, 0.96);
  --v2-background-bg-layer-04: rgba(31, 46, 71, 0.98);
  --v2-text-text-base: #e8eef8;
  --v2-text-text-muted: #b3c0d4;
  --v2-text-text-faint: #90a1b9;
  --v2-icon-icon-base: #d8e5f6;
  --v2-icon-icon-muted: #aabbd1;
  --v2-icon-icon-faint: #8195af;
  --v2-border-border-base: rgba(171, 196, 232, 0.18);
  --v2-border-border-muted: rgba(171, 196, 232, 0.10);
  --v2-border-border-strong: rgba(171, 196, 232, 0.28);
  --v2-overlay-simple-overlay-scrim: rgba(3, 9, 19, 0.60);
}

html {
  background-color: #071321 !important;
  background-image: radial-gradient(ellipse at 20% 10%, #193959 0%, transparent 60%),
    linear-gradient(135deg, #0b2037, #071321) !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
  background-position: center !important;
}

body, #root {
  background-color: transparent !important;
}

[data-slot="titlebar-v2"] {
  background-color: transparent;
  color: #d8e5f6;
  border-bottom-color: rgba(171, 196, 232, 0.12);
}
```

这些令牌的 :root 优先级未刻意压过所有官方主题选择器。探针通过、表面仍白时，应在目标元素 computedStyle 追踪哪个本地/主题规则获胜，再给**已核实的颜色令牌规则**补精确选择器；不要给所有颜色加 important。旧 CSS `:root[data-theme][data-color-scheme]` 可作为本机检查线索，不是保证未来存在的公开选择器。

为确保语义色不失真，首版保留官方 diff 红/绿、代码高亮、选中态和禁用态映射；若出现浅底深色分支不兼容，应针对该组件经验证的颜色消费者补映射，不强行改其 data-color-scheme 属性。滚动条只用 scrollbar-color，不引入尺寸覆盖。

### 6.4 动态背景生成：图片内部动画，不添加 UI 动画

`scripts/make-background.mjs`：

```js
import { writeFileSync } from "node:fs"
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
  <defs><radialGradient id="g"><stop stop-color="#24537a"/><stop offset="1" stop-color="#071321"/></radialGradient></defs>
  <rect width="1600" height="1000" fill="#071321"/>
  <ellipse cx="350" cy="250" rx="1100" ry="800" fill="url(#g)">
    <animate attributeName="opacity" values="0.45;0.9;0.45" dur="24s" repeatCount="indefinite"/>
  </ellipse>
</svg>`
const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
writeFileSync(new URL("../src/background.generated.css", import.meta.url),
  `/* 仅图片内部动画，不修改官方 CSS 动画。 */\nhtml { background-image: url("${uri}") !important; }\n`,
)
```

SMIL 在 CSS 图像中可独立运行，但实际产品 Chromium 和 CSP 尚需确认；失败不影响静态 background-color。入口将静态和动态 CSS 合并成一个 Style 字符串，动态规则始终排在静态规则后面，不依赖不同 Style 贡献的插入顺序。启用后仍须检查 computedStyle 的 backgroundImage，不能仅凭设置状态宣称动态背景已可见。

构建流程（后续实现时，在插件目录执行）：

```powershell
npm install
npm run build
```

`npm run dev` 适合查看本地 GUI 重载；发布前必须完整 build。watch 模式不会在每次 CSS 修改自动重复前置命令，不能作为 CSS 门禁的替代。官方文档说明本地 CJS 重建会热重载 GUI；不是让用户每次修改配置都重启整个 Desktop。

## 7. 唯一验收证据：目标窗口 DevTools JSON 快照与严格 diff

### 7.1 可直接粘贴运行的工具

先在**真正的 OpenCode app renderer** DevTools 粘贴本段。不要在设置中的嵌入浏览器、server 日志页、Electron main 控制台里执行。脚本不改样式，不注入测试 DOM，不调用 focus，不移动滚动条；仅添加被动观察式事件监听器。重复粘贴会清理旧监听器。

它记录所有元素，不限于 button/input/a/nav；读取开放 Shadow DOM。closed Shadow DOM、跨域 iframe 和宿主外原生控件不能用页面 JS 完全观测，会明确留下覆盖范围缺口。**不得将有缺口的结果包装成“所有控件已证明完全一致”。**

```js
(() => {
  window.DSLayout?.dispose?.()
  const snapshots = new Map()
  const trace = []
  const listeners = []
  let tracing = false
  let pending = null
  let timer = null
  const ignored = (el) => ["STYLE", "SCRIPT", "LINK", "META", "TEMPLATE"].includes(el.tagName)
    || el.id === "ds-skin-background"

  function key(el) {
    if (!el || el.nodeType !== 1) return null
    const parts = []
    let node = el
    while (node && node.nodeType === 1) {
      const tag = node.localName
      const parent = node.parentElement
      const peers = parent ? [...parent.children].filter((e) => e.localName === tag) : []
      parts.unshift(`${tag}:nth-of-type(${parent ? peers.indexOf(node) + 1 : 1})`)
      const root = node.getRootNode()
      if (!parent && root instanceof ShadowRoot) {
        parts.unshift("::shadow")
        node = root.host
      } else node = parent
    }
    return parts.join(">")
  }

  function collect() {
    const elements = []
    const roots = [document]
    const gaps = []
    function walk(el) {
      if (ignored(el)) return
      elements.push(el)
      if (el.shadowRoot) {
        roots.push(el.shadowRoot)
        for (const child of el.shadowRoot.children) walk(child)
      } else if (el.localName.includes("-")) {
        gaps.push(`${key(el)}：自定义元素未公开 shadowRoot，不能排除 closed shadow`)
      }
      if (["iframe", "frame", "webview"].includes(el.localName)) {
        gaps.push(`${key(el)}：子文档需在该 frame 中单独运行工具并验收`)
      }
      for (const child of el.children) walk(child)
    }
    walk(document.documentElement)
    return { elements, roots, gaps }
  }

  function active() {
    let el = document.activeElement
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    return key(el)
  }

  function listen(root) {
    if (listeners.some((entry) => entry.root === root)) return
    const onKey = (event) => {
      if (!tracing || event.key !== "Tab" || !event.isTrusted) return
      pending = { key: event.shiftKey ? "Shift+Tab" : "Tab", from: active() }
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (pending) trace.push({ ...pending, to: active(), reason: "未收到页面 focusin" })
        pending = null
      }, 200)
    }
    const onFocus = () => {
      if (!tracing) return
      if (pending) {
        trace.push({ ...pending, to: active(), reason: "键盘导航" })
        pending = null
        clearTimeout(timer)
      }
    }
    root.addEventListener("keydown", onKey, true)
    root.addEventListener("focusin", onFocus, true)
    listeners.push({ root, onKey, onFocus })
  }
  listen(document)

  const styleProps = [
    "position", "display", "z-index", "box-sizing", "width", "height", "min-width", "min-height",
    "max-width", "max-height", "padding", "margin", "inset", "border-width", "border-style",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "white-space",
    "overflow-x", "overflow-y", "scrollbar-width", "transform", "translate", "scale", "rotate",
    "zoom", "filter", "backdrop-filter", "opacity", "contain", "container-type", "isolation",
    "pointer-events", "visibility", "cursor", "clip-path", "content-visibility", "will-change",
    "animation-name", "animation-duration", "transition-property", "transition-duration",
    "flex", "flex-direction", "flex-wrap", "order", "grid-template-columns", "grid-template-rows",
    "grid-auto-flow", "gap", "align-items", "justify-content", "text-indent", "word-spacing",
    "overflow-wrap", "word-break", "font-stretch", "aspect-ratio", "float", "clear",
    "perspective", "touch-action", "user-select", "appearance", "color-scheme",
  ]
  const rectFields = ["x", "y", "top", "right", "bottom", "left", "width", "height"]
  const scrollFields = ["scrollWidth", "scrollHeight", "clientWidth", "clientHeight", "scrollLeft", "scrollTop"]
  const interactive = 'button,input,a,nav,textarea,select,summary,[tabindex],[contenteditable],[role="button"],[role="link"],[role="textbox"],[role="menuitem"],[role="option"],[role="tab"],[role="checkbox"],[role="radio"],[role="slider"],[role="combobox"],[draggable="true"],label'
  const fields = (obj, names) => Object.fromEntries(names.map((name) => [name, obj[name]]))

  function hit(el, rect) {
    if (!rect.width || !rect.height) return []
    const dx = Math.min(1, rect.width / 4), dy = Math.min(1, rect.height / 4)
    const points = [
      [rect.x + rect.width / 2, rect.y + rect.height / 2],
      [rect.left + dx, rect.top + dy], [rect.right - dx, rect.top + dy],
      [rect.left + dx, rect.bottom - dy], [rect.right - dx, rect.bottom - dy],
    ]
    const root = el.getRootNode()
    return points.filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
      .map(([x, y]) => ({ x, y,
        document: document.elementsFromPoint(x, y).filter((n) => !ignored(n)).map(key),
        shadow: root instanceof ShadowRoot && typeof root.elementsFromPoint === "function"
          ? root.elementsFromPoint(x, y).filter((n) => !ignored(n)).map(key) : [],
      }))
  }

  async function snapshot(label) {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const { elements, roots, gaps } = collect()
    roots.forEach(listen)
    const candidates = []
    const records = elements.map((el, index) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const blocked = el.matches(":disabled") || !!el.closest("[inert]")
      const visible = el.getClientRects().length > 0 && cs.visibility === "visible"
      if (el.tabIndex >= 0 && !blocked && visible) candidates.push({
        key: key(el), tabIndex: el.tabIndex, domIndex: index,
      })
      const attrs = Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])
        .sort(([a], [b]) => a.localeCompare(b)))
      const pseudo = Object.fromEntries(["::before", "::after"].map((p) => {
        const s = getComputedStyle(el, p)
        return [p, Object.fromEntries(["content", ...styleProps].map((name) => [name, s.getPropertyValue(name)]))]
      }))
      return {
        key: key(el), attrs,
        childNodes: [...el.childNodes].filter((node) => node.nodeType !== 1 || !ignored(node))
          .map((node) => node.nodeType === 1 ? { type: 1, key: key(node) }
            : { type: node.nodeType, text: node.nodeValue }),
        rect: fields(r, rectFields), scroll: fields(el, scrollFields),
        interactive: el.matches(interactive),
        tabIndex: el.tabIndex, disabled: el.matches(":disabled"),
        style: Object.fromEntries(styleProps.map((name) => [name, cs.getPropertyValue(name)])),
        pseudo, hit: el.matches(interactive) ? hit(el, r) : [],
      }
    })
    candidates.sort((a, b) => {
      const x = a.tabIndex > 0 ? a.tabIndex : Infinity
      const y = b.tabIndex > 0 ? b.tabIndex : Infinity
      return x === y ? a.domIndex - b.domIndex : x - y
    })
    const data = {
      environment: {
        url: location.href, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
        visualViewport: window.visualViewport ? [visualViewport.width, visualViewport.height, visualViewport.scale,
          visualViewport.offsetLeft, visualViewport.offsetTop] : null,
        scroll: [scrollX, scrollY], active: active(),
      },
      coverage: { elements: records.length, openRoots: roots.length - 1, gaps },
      documentScroll: fields(document.scrollingElement || document.documentElement, scrollFields),
      records, tabCandidates: candidates, focusTrace: structuredClone(trace),
    }
    snapshots.set(label, data)
    console.log(JSON.stringify({ label, data }, null, 2))
    return data
  }

  function diff(left, right) {
    const a = typeof left === "string" ? snapshots.get(left) : left
    const b = typeof right === "string" ? snapshots.get(right) : right
    if (!a || !b) throw new Error("缺少快照")
    const changes = []
    function walk(x, y, path) {
      if (Object.is(x, y)) return
      if (x === null || y === null || typeof x !== "object" || typeof y !== "object") {
        changes.push({ path, before: x ?? null, after: y ?? null })
        return
      }
      for (const name of new Set([...Object.keys(x), ...Object.keys(y)])) {
        walk(x[name], y[name], `${path}/${name}`)
      }
    }
    walk(a, b, "")
    const report = {
      passForObservedDOM: changes.length === 0,
      fullCoverage: !a.coverage.gaps.length && !b.coverage.gaps.length,
      realTabTraceRecorded: a.focusTrace.some((t) => t.reason === "键盘导航")
        && b.focusTrace.some((t) => t.reason === "键盘导航"),
      changes,
    }
    console.log(JSON.stringify(report, null, 2))
    return report
  }

  window.DSLayout = {
    snapshot, diff, snapshots,
    json: (label) => JSON.stringify(snapshots.get(label), null, 2),
    startFocusTrace() { trace.length = 0; pending = null; tracing = true; clearTimeout(timer) },
    stopFocusTrace() { tracing = false; pending = null; clearTimeout(timer); return structuredClone(trace) },
    dispose() {
      clearTimeout(timer)
      for (const { root, onKey, onFocus } of listeners) {
        root.removeEventListener("keydown", onKey, true)
        root.removeEventListener("focusin", onFocus, true)
      }
    },
  }
  console.info("DSLayout 已就绪；先关闭皮肤，再 await DSLayout.snapshot('before')")
})()
```

### 7.2 “改前 / 改后”用法

**先做几何与滚动检测，不录焦点轨迹：**

```js
// 皮肤关闭，返回固定测试界面，保持焦点、内容、菜单、滚动完全一致。
await DSLayout.snapshot("before")
copy(DSLayout.json("before")) // Chrome/Electron DevTools 的 copy 辅助函数

// 从 Settings 开启皮肤，再返回同一界面，恢复相同焦点/滚动/菜单状态。
// 或在调试器中控制插件自己的开关；不可修改官方 DOM、style 或状态做补偿。
await DSLayout.snapshot("after")
copy(DSLayout.json("after"))
DSLayout.diff("before", "after")
```

diff 的 `changes` 必须是空数组；任何浮点差异都失败，不能临时放宽 epsilon。两次 active 不同也失败，应恢复**同一个**起点重新测量，不能在 diff 中删除 active 字段。

若 app 重载导致内存丢失，把两份原始 JSON 保存为 before.json/after.json；在 DevTools 将文件内容分别赋给 `const before = ...`、`const after = ...`，运行 `DSLayout.diff(before, after)`。`copy` 导出的是 data 本体；如果导出整条控制台 JSON，需传 `.data`。两次环境必须相同，不能用不同窗口/路由的数据硬比。

**再做真实键盘焦点验收：**

1. 关闭皮肤，预先打开需要覆盖的菜单/对话框；让工具 snapshot 一次，安装开放 Shadow Root 的监听器。
2. 运行 `DSLayout.startFocusTrace()`，把焦点放回约定的同一个页面控件，使用真实键盘完成相同数量的 Tab，再完成 Shift+Tab，尽量遍历一整圈。不要在途中切 DevTools、点设置或发送提示。
3. 回到控制台运行 `DSLayout.stopFocusTrace()`，恢复相同起点/滚动后运行 `await DSLayout.snapshot("before-focus")`。stop 不清空轨迹。
4. 开启皮肤，重新准备同一状态，运行 startFocusTrace，重复**完全相同的真实按键路径**，stop 后采 `after-focus`。
5. `DSLayout.diff("before-focus", "after-focus")` 必须无差异；`realTabTraceRecorded` 必须 true。Tab 离开 WebContents 的边界无法由页面 focusin 完整描述，需人工确认并在记录中说明，或由主会话后续使用 Electron 输入自动化补足。

`tabCandidates` 是静态候选估计，不能冒充浏览器真实顺序：radio 分组、Shadow DOM 插槽、焦点陷阱、正 tabIndex 和平台设置都可能改变实际结果。真实按键轨迹专门补这个缺口。脚本不执行 synthetic KeyboardEvent 来假装 Tab，因为那不会触发原生焦点导航。

### 7.3 测试矩阵和证据边界

- 主会话：空页面、长会话、代码块、流结束后的消息、diff、文件树/编辑器；固定相同内容。
- 浮层：菜单、子菜单、选择器、对话框、提示、权限/提问 dock；分别采前后数据，不拿“菜单关闭”和“菜单打开”相比。
- 窗口：常用尺寸、窄窗口、最大化、DPR/缩放档位；**每档各做一组同条件对比**。
- 滚动：文档顶部/中部/底部、嵌套滚动容器；包括横向滚动，不只 scrollHeight。
- 生命周期：开启→关闭回基线、动态→静态、系统减少动态效果、第二窗口、热重建、导航重载、关闭 GUI 插件。
- 鼠标：中心/四角采样只是有限覆盖，不能证明任意坐标的完整命中集合；另实点按钮边缘、拖拽区域、滚动条、窗口标题栏。原生标题栏和 closed shadow 必须独立确认，不能伪造为 DOM 已覆盖。
- focusTrace 不是行为形式化证明；实际完成哪些 Tab 路径就证明哪些路径。没有真实轨迹、closed shadow 未覆盖或原生控件未检查时，结论必须写“已观测 DOM 通过，剩余范围待证”，不得发布“全控件绝对零影响”。

这套脚本是可重复的差异证据，不是对未来任意页面/版本的数学保证。发布清单保留所有原始 JSON、差异报告、覆盖缺口和宿主版本。截图只用于记录配色，不替代 JSON 证据。JSON 包含 DOM 属性、可见文本和可能的输入属性，可能含会话或项目敏感信息；只在本地保存，分享前脱敏，但本地验收仍比较原始数据。

## 8. 旧 CSS 迁移清单（仅只读审查，未修改旧仓库）

实际读取的 `D:\project\AI_test\opencode桌面端ds美化\theme.css` 当前为 **304 行**，不是题述的 282 行，说明需以磁盘内容为准。

| 旧范围 | 处理建议 |
| --- | --- |
| 5–114 行大量颜色变量 | 逐个审计消费者后迁入封闭颜色令牌表；不直接允许所有变量 |
| 120–184 行局部颜色令牌/scrollbar-color | 目标版本选择器验证通过后保留；保护 sticky 阅读底色和 diff 语义 |
| 186–207 行根透明、video 和 body::before | 根背景用颜色长属性；video/伪元素从首版删除，以 html 背景替代 |
| 210–247 行菜单/浮层模糊 | 保留可读颜色/阴影的思想，不直接复制 broad blur 规则 |
| 250–269 行 dock/代码背景 | 分组件验证颜色消费者；避免把阅读区过度透明化 |
| 275–279 行标题栏颜色 | 可按已验证选择器保留颜色；不碰窗口按钮几何和命中 |
| 283–299 行 session 标题与消息气泡模糊 | 默认去掉滤镜，只保留颜色；不会因为自述“只改视觉”就自动判合格 |

升级策略：每次 Desktop 或 GUI SDK 更新，先关皮肤确认原生基线；再跑探针、CSS 检查与测试矩阵。experimental 接口发生变化时宁可显式失效，不篡改安装文件自动修补。

## 9. 核实来源

以以下官方 V2 页面为 OpenCode API 依据，不使用 V1 主题/插件文档推断 Desktop 功能：

1. <https://opencode.ai/v2/docs/build/plugins/gui>：Style、setup/main、exports、Vite 预设、GUI 来源、SettingsPage、Store、ctx.windows、appearance、生命周期。
2. <https://opencode.ai/v2/docs/build/plugins>：GUI-only 包、ID 来源、统一包的各部分和本地目录解析。
3. <https://opencode.ai/v2/docs/themes>：主题属于 terminal client，cli.json 和主题 JSON 范围。
4. <https://www.electronjs.org/docs/latest/api/web-contents>：insertCSS、cssOrigin、removeInsertedCSS 与 executeJavaScript；实现时要与实际内置 Electron 版本复核。
5. <https://drafts.csswg.org/filter-effects-2/>，§2.1：backdrop-filter 的层叠上下文/absolute 和 fixed 包含块规则；草案状态不等于所有 Chromium 版本已一致实现。
6. <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter>：Backdrop Root、opacity/filter 对背景采样的限制。

**下一步实施顺序：** 先只做 GUI 入口 + 私有变量探针，证明 CSS 真正进入 2.2.3 目标窗口；再引入最小颜色令牌和静态背景；零差异验收通过后才加动态图片。实时浮层模糊不作为首版上线前提。

### 本文代码的实际校验记录

- Node 24.16.0：本文 3 个 JSON 块解析通过、8 个 JavaScript 块语法解析通过。
- 在内存中加载 PostCSS 8.5.6 及其依赖，直接提取本文扫描器与回归测试执行：全部通过；最小 theme.css 和实际生成的 background.generated.css 均通过门禁。该检查没有安装依赖或在工作区生成额外文件。
- **尚未执行**：目标 @opencode/plugin SDK 的 TypeScript 类型检查、Vite 实际构建、2.2.3 GUI 入口加载和目标桌面前后快照。因此这里提供的是有语法/扫描器验证的实现设计，不是已经在用户桌面通过验收的成品。
