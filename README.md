# 深海大肥鱼 · OpenCode Desktop 皮肤插件

用 **OpenCode V2 官方 GUI 插件**（`./gui-experimental`）实现的桌面端皮肤。
不再修改 `app.asar`，官方更新不会覆盖它。

## 和旧版的关系

旧版（v2.x）通过解包/重打 `app.asar` 注册原生主题，绑定 Desktop 2.0.32，官方一更新就失效。
本版改为官方插件：只注入一段颜色类 CSS，并通过 `Style` 注册表由宿主管理生命周期。

## 效果

- 深蓝配色、半透明表面、代码块/菜单/用户气泡的深色底
- 背景：默认内嵌原始视频（1080p）循环播放；窗口不可见时自动暂停
- 可切换为轻量 SVG 渐变动画（构建时 `DS_VIDEO_COMPRESS=1`）
- 设置 → **深海皮肤** 里两个开关：启用皮肤、动态背景

## 安装

1. 把本目录放到任意固定位置（路径不要含会被移动的临时目录）；
2. 在全局 `~/.config/opencode/opencode.jsonc` 里加入：

```jsonc
{
  "plugins": [
    "D:/project/AI_test/opencode桌面端ds美化-plugin"
  ]
}
```

3. **完全退出 OpenCode 再打开**（热重载对 Style 不彻底）；
4. 设置 → 深海皮肤 → 打开「启用颜色皮肤」。

## 构建

```powershell
npm install
npm run build          # 默认内嵌原片（约 14.5 MB 插件）
```

需要小体积时：

```powershell
$env:DS_VIDEO_COMPRESS='1'; npm run build; Remove-Item Env:DS_VIDEO_COMPRESS
```

构建链会依次执行：生成背景 → CSS 门禁（属性白名单/黑名单）→ 门禁回归测试 → Vite 打包。

`assets/` 与 `src/*.generated.*` 不入库；换背景视频时把文件放到 `assets/zipzip-1080p.mp4` 再构建。

## 约束（重要的边界）

- **只改颜色类属性**：`color`、`background-*`、`border-*-color`、`box-shadow`、`outline-color`、`scrollbar-color` 与审计过的颜色变量；
  构建期门禁会拒绝 `width/padding/position/transform/font/overflow/z-index` 等一切可能影响布局的属性。
- **背景画在 `html` 上**，不新增节点、不影响文档流；视频层是唯一例外，`position: fixed` + `pointer-events:none` + `inert`。
- **需要官方深色模式**：皮肤不改 `color-scheme`，浅色模式下设置页会是黑字。
- **没有实时模糊**：`backdrop-filter` 会创建包含块，首版不启用。
- GUI 插件 API 仍标记 experimental，OpenCode 大版本升级后可能需要适配；升级后先确认「设置里插件还在、界面仍是深色」。

## 目录

```
src/gui.tsx        插件入口：Store、Style、SettingsPage、视频层
src/theme.css      颜色令牌与表面（受门禁约束）
src/color-tokens.json  允许覆盖的颜色变量白名单
scripts/check-css.mjs  CSS 属性门禁
scripts/make-video.mjs 视频内嵌（默认原片，可压缩）
scripts/make-background.mjs  SVG 动态背景
DESIGN.md          设计依据：零布局影响的定义、属性政策、验收脚本
DSLayout.js        布局验收脚本（DevTools 粘贴运行）
dist/              构建产物（已提交，可直接使用）
```

## 验收

布局是否被改动，不看截图，看 JSON 差异：

```js
await DSLayout.snapshot("before")   // 关闭皮肤
await DSLayout.snapshot("after")    // 开启皮肤，同一界面/滚动位置
DSLayout.diff("before", "after")    // changes 必须为空数组
```

## 素材

`assets/` 中的背景视频由使用者自行提供，不在版本库中；`dist/` 内含构建时嵌入的副本。
