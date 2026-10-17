# 深海大肥鱼 · OpenCode Desktop 可选主题

在 **设置 → 外观 → 主题** 中选择「**深海大肥鱼**」，启用深蓝玻璃界面和动态背景；切换其他主题时停用全部附加样式，暂停视频并释放媒体源。重启通过 OpenCode 原生主题选择记录恢复，不维护另一套偏好配置。

本项目只保留这一种可选主题方案，版本 **2.0.0**。旧全局覆盖、实验入口、回退旧全局版的流程及模拟预览已移除。

> 非官方应用资源补丁，不是官方主题插件。仍需在本机修改 `app.asar`，官方更新后可能覆盖补丁，不能免除后续版本适配。

## 兼容性与边界

| 项目 | 当前状态 |
|---|---|
| 平台 | Windows |
| OpenCode Desktop | **2.0.32**；未知版本明确拒绝，不承诺旧版本可用 |
| Node.js | >=22.12.0，CI 使用 Node 24 |
| 应用位置 | `%LOCALAPPDATA%\Programs\@opencode-aidesktop` |
| 主题名称／内部 ID | 深海大肥鱼／`ds-deepsea`；ID 保持不变以保留原有选择 |
| 验收 | 用户已安装并确认主题切换、名称生效；不代表所有设备与状态组合均经过验证 |

主题按深色解析，但**不改用户保存的系统／浅色／深色偏好**；切回其他主题后恢复其原生解析。只调整颜色、背景、模糊和阴影，不修改按钮大小、位置、布局、焦点逻辑、滚动行为或 UI 动画。主进程及原生模块保持原始字节。

## 外观范围

- 动态深海背景、透明顶栏、深蓝玻璃菜单／摘要和提问／权限浮层。
- 菜单背景 60%、提问等浮层 48%、Markdown 代码背景 32%、已发送消息白灰背景 62% 不透明度；这些不是整个窗口的透明度。
- 补齐控件、图标、链接、蓝灰滚动条及提问选中配色。仅针对确认过的滚动容器改色，不改宽度、隐藏条件或动画。
- 文件／差异视图使用深蓝阅读底、蓝灰行号、琥珀搜索高亮和可读的红绿强调文字；保留语法、增删语义、选区和搜索行为。
- 技能名称原生白底悬停提示不改；历史会话文字直接叠背景的表现保留，不加条目阅读底。
- 内置 Ghostty 终端画布／ANSI／滚动条保持原生；HTML 预览属于独立 iframe，其内部滚动条由页面自身控制。
- 文件树／审查面板的原生布局问题不作为美化补丁修复，切换原生主题仍可观察到的现象不据此自动归因于美化。

视频与模糊会增加 GPU 开销。样式限域和静态对比度检查不等于完整视觉／性能保证，需在自己的机器上验收。

## 首次安装

```powershell
git clone https://github.com/yunhesi-wind/opencode-desktop-ds-theme.git
cd opencode-desktop-ds-theme
npm ci --ignore-scripts
```

先阅读 [素材与第三方声明](THIRD_PARTY_NOTICES.md)，自行确认使用权限，再选择下载：

```powershell
node download-background.cjs --accept-upstream-license
# Windows 已设置系统代理时：
node download-background.cjs --accept-upstream-license --system-proxy
```

也可自行提供匹配固定大小和 SHA-256 的 `assets/zipzip-1080p.mp4`。许可确认选项不等于版权授权。

构建与安装可分开执行：

```powershell
node deploy.cjs prepare
# 保存工作并完全退出 OpenCode Desktop 后：
node deploy.cjs install
```

或退出桌面端后双击 **`Install-Theme.cmd`**，统一用于首次安装和后续更新：按顺序执行 `prepare --upgrade`、`install`，任一步失败即停止。该参数不会绕过版本／哈希校验。重新打开，选择「深海大肥鱼」。首次不会替你更改已选主题，未选中时看见原生界面是正常现象。

## 更新

### 主题代码更新、Desktop 版本未变

更新源码并测试后重新 `prepare`，退出桌面端再 `install`。**不必恢复旧版或先卸载**；构建从已验证的官方原包生成，已知同版本主题哈希可安全更新。

### 官方 Desktop 更新

先等本项目明确适配该版本，再退出桌面端运行 **`Install-Theme.cmd`**，等价于：

```powershell
node deploy.cjs prepare --upgrade
node deploy.cjs install
```

`--upgrade` 不会放行未知版本、降级或同版本未知修改。目前仅支持 2.0.32。新版使用独立原包备份，不继承旧版主题哈希；禁止跨官方版本恢复。

## 状态与恢复

```powershell
node deploy.cjs status
```

状态区分当前主题、已知先前主题、官方原版和未知文件。查看状态不修改应用。

只想关闭美化：在应用里选择其他主题即可，**无需卸载**。

要移除补丁并恢复**官方原版**：保存工作并完全退出桌面端，双击 **`Restore-Theme.cmd`**，或：

```powershell
node deploy.cjs restore
# 主 manifest 损坏时，可指定当前版本的已验证备份目录：
node deploy.cjs restore --backup ".\backups\<版本-selectable-原包哈希>"
```

恢复不依赖主题输出包，不修改会话、模型、MCP、skills、凭据或用户偏好。原版不认识 `ds-deepsea` 时可能回到 OpenCode 默认主题，可自行重新选择。脚本不强杀进程，不改 `app.asar.unpacked`，未知哈希或原生文件变化时拒绝覆盖。

## 文件与本机数据

```text
theme.cjs                 原生主题注册、选择器限域、视频启停
theme.css                 当前主题的配色与表面样式
deploy.cjs                唯一构建／安装／恢复／状态入口
archive.cjs               ASAR、原生文件、素材及替换校验
storage.cjs               原子 metadata 和备份发布
background.cjs            固定素材来源与哈希
download-background.cjs   可选下载与代理支持
Install-Theme.cmd         唯一安装／更新入口
Restore-Theme.cmd         恢复官方原版
test/                     当前方案的回归测试源码（不是测试产物）
vendor/LICENSE            必须保留的上游 MIT 许可
```

以下只存在于本机，不上传 GitHub：

| 路径 | 用途 |
|---|---|
| `assets/` | 校验过的背景素材 |
| `runtime/manifest.json` | 当前部署记录，format 2、selectable 模式 |
| `runtime/builds/` | 本机构建的主题 ASAR 及配套 unpacked 文件 |
| `backups/<版本-selectable-哈希>/` | 官方干净原包、配套原生文件及恢复 metadata |

**不要删除当前 manifest、其引用的主题输出或官方原包备份。**其他中间构建只有在确认未被当前记录引用、不用于恢复后才可删除。安装期间不清理数据。新目录已接管本机旧记录，旧 `prepared/`、`experiments/` 及旧全局主题文件不再使用。

## 测试与维护

```powershell
npm test
npm audit --omit=dev --audit-level=high
```

测试覆盖原生主题注册、启动 ID 校验、配色限域、视频启停、UI 属性边界、颜色对比、原包接口、原子备份、首次安装／同版本更新／官方原包恢复和未知修改拒绝。无素材或本机原包时，相关检查明确跳过；LF／CRLF 均需通过。GitHub `Source checks` 不包含本机素材和应用包。

维护顺序：更新本项目 → 测试／构建 → 必要的用户安装验收 → 同步 `D:\project\AI_test\OpencodeSelfuse\README.md` 对应说明 → 确认完成后分别提交并推送主题仓库与 [OpencodeSelfuse](https://github.com/yunhesi-wind/OpencodeSelfuse)。Selfuse 只存描述和链接，不复制主题文件。CLI 美化独立维护，不要求另一个主题同时升级或保持相同 OpenCode 版本。

不夹带无关修改，不上传应用包、备份、素材、个人配置或截图；分别说明源码测试、实际验收与推送结果，失败不得宣称同步完成。

## 许可

代码采用 [MIT](LICENSE)。基于 daemon1s/opencode-deepseek-chan，保留 `vendor/LICENSE`；素材不属于代码 MIT 许可，权利链未独立核实。由 yunhesi-wind 维护，含 OpenAI GPT 辅助贡献。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
