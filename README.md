# OpenCode Desktop DS Theme · 深海女仆玻璃主题

非官方 Windows 桌面主题改版：动态二次元背景、透明顶栏、深蓝色玻璃浮层及半透明消息气泡。
基于 [daemon1s/opencode-deepseek-chan](https://github.com/daemon1s/opencode-deepseek-chan)，
上游提交 `b59ba94581ffb2d48b4e180194c119c9661cab99`。由 **yunhesi-wind** 维护，包含 **OpenAI GPT** 辅助贡献。

**只发布源码，不分发背景视频、OpenCode 应用包或备份。** 用户在自己机器上构建并安装。
原作者及素材署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，修改说明见 [CHANGELOG.md](CHANGELOG.md)。

## 效果与兼容性

- 深海女仆动态背景，静音循环；应用内半透明，不透出 Windows 桌面。
- 透明顶栏，主页／新建等操作按钮局部深色，保留图标尺寸及原生窗口控制。
- 第二层上下文／会话栏使用模糊底色，减少滚动文本穿透。
- 深蓝玻璃菜单、提问／权限确认、弹窗；白灰半透明已发送消息。
- 代码和浮层更通透；保留气泡发送状态变化及差异高亮的原生样式。

| 环境 | 支持范围 |
|---|---|
| 系统 | Windows，仅此平台经过本机验收 |
| OpenCode Desktop | **2.0.24**，其他版本明确拒绝，不承诺兼容 |
| Node.js | >= 22.12.0 |
| 安装位置 | `%LOCALAPPDATA%\Programs\@opencode-aidesktop` |
| 网络工具 | `curl.exe`、PowerShell（系统自带） |

这是应用资源补丁，不是官方主题插件。修改 `app.asar` 会影响更新兼容性，升级 OpenCode 后需要重新适配。
动态视频和模糊合成会增加 GPU 开销；文字可读性和性能需在自己的设备上验收。

## 首次安装

```powershell
git clone https://github.com/yunhesi-wind/opencode-desktop-ds-theme.git
cd opencode-desktop-ds-theme
npm ci --ignore-scripts
```

先阅读素材声明。背景的 CC BY-NC-SA 4.0 信息仅来自上游，权利链未独立核实。
确认自己的使用权限后，再选择下载：

```powershell
node download-background.cjs --accept-upstream-license
# Windows 开启了系统代理时：
node download-background.cjs --accept-upstream-license --system-proxy
# 或显式提供代理：
node download-background.cjs --accept-upstream-license --proxy http://127.0.0.1:7897
```

下载器校验现有缓存及新下载的大小和 SHA-256，不使用第三方镜像，不执行下载内容。
也可以自行将上游同一视频放到 `assets/zipzip-1080p.mp4`；内容仍必须匹配固定哈希。

构建（不改变已安装应用）：

```powershell
node deploy.cjs prepare
```

**保存工作，完全退出 OpenCode 桌面版**，再双击 `Install-Theme.cmd` 或执行：

```powershell
node deploy.cjs install
```

重新打开后检查视频播放、菜单、问题面板、代码区、内置终端及滚动性能。
脚本不强制终止桌面进程，不修改会话数据库、模型、skills、MCP 或凭据。

## 更新主题与恢复

在同一目录更新源码后重新 `prepare`，退出桌面版再安装；构建会复用经校验的干净原包。
当前应用哈希未知、版本不同、原生文件或素材校验失败时拒绝覆盖。

恢复：退出桌面版，双击 `Restore-Theme.cmd` 或执行 `node deploy.cjs restore`。
主题包损坏／丢失不阻断原包恢复，原始 snapshot 不可用时查找验证过的备份。
若主 manifest 损坏，可以指定备份目录：

```powershell
node deploy.cjs restore --backup ".\backups\<版本与哈希目录>"
```

**不要删除 `prepared/` 或 `backups/`，不要在应用更新后恢复旧版本。**
此入口仍拒绝覆盖未知版本，备份 metadata 记录已安装的主题哈希。

## 测试与本地预览

```powershell
npm test
npm audit --omit=dev
```

基础测试无需下载素材；素材验证和真实素材构建测试在视频存在时运行，否则明确跳过。
测试覆盖失败发布、备份重试、恢复独立性、升级哈希限制及原生文件保留。
CSS 静态检查不等于所有真实组件视觉回归，当前视觉验收来自维护者本机。

`preview/` 是示例界面，不是实际桌面截图。预览需要用户从本机原包提取的
`preview/native.css`，该文件不公开分发；使用者通常直接安装后验收即可。

## 项目结构与许可证

```text
deploy.cjs                 # 版本绑定的本机构建、安装、恢复
storage.cjs                # manifest 与备份发布
theme-fixed.css            # 发布时注入的完整改版效果
background.cjs             # 固定素材来源、大小、哈希
download-background.cjs    # 用户选择下载与代理、校验
test/                      # 隔离测试
vendor/                    # 上游许可与说明（非部署入口）
```

代码按 [MIT](LICENSE) 发布，完整保留原作者许可；背景不属于 MIT 范围。
素材下载选项只是知情确认，不等于版权授权；公开展示截图也需核实素材许可。
本项目与 OpenCode、DeepSeek、上游作者没有官方关联或背书。软件按原样提供，无担保。
