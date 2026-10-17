# 第三方来源、素材与贡献声明

## 上游主题方向与代码

- 作者：daemon1s
- 项目：<https://github.com/daemon1s/opencode-deepseek-chan>
- 基于提交：`b59ba94581ffb2d48b4e180194c119c9661cab99`
- MIT 原始版权与许可全文保留在 `vendor/LICENSE`，不得因项目整理删除。

本项目沿用深海女仆动态背景的方向，独立维护「深海大肥鱼」可选主题注册、限域样式、视频生命周期、部署校验和测试；旧上游引擎不再作为运行入口。

## 背景素材

- 作品：`DeepSeek 蓝色大肥鱼 深海女仆 鲸鱼娘`
- 创作者：ZipZipPipe（Bilibili）
- 基础设计：上善无形（Bilibili）
- 发布者：HDHKVT
- 原作来源：<https://steamcommunity.com/sharedfiles/filedetails/?id=3787993441>
- 下载来源：上游 GitHub Release `v1.0.0/zipzip-1080p.mp4`
- 上游声明许可：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**素材许可只依据上游声明，原作权利链尚未独立核实。**用户须自行确认下载、使用和展示权限；下载器的确认参数不构成授权。素材不属于代码 MIT 许可，不随本仓库分发，也未修改其内容。

若该素材许可确实适用，应遵守署名、非商业、相同方式共享和修改说明等要求。公开截图／视频同样需核实许可，不能用署名代替授权。

## OpenCode 与依赖

OpenCode 和原生模块由用户从官方获得。本仓库不发布应用 ASAR、unpacked 文件、原包备份或提取的原生 CSS。`@electron/asar` 通过 npm 安装，其许可见对应 package。

主题注册使用已审查版本的内部实现，不是官方公开扩展接口。项目与 OpenCode、DeepSeek、上游作者及素材作者没有官方关联或背书。代码 MIT 不覆盖第三方应用与素材，也不额外限制上游 MIT 代码许可。

## 维护与 AI 辅助

由 yunhesi-wind 维护并选择需求；代码、CSS、测试和文档含 OpenAI GPT 辅助贡献。用户本机验收不代表其他设备或所有界面状态均已验证。

提交中的 `Co-authored-by: OpenAI GPT <gpt@users.noreply.github.com>` 是辅助贡献署名，不保证关联到已验证的 GitHub 账号，也不表示任何机构背书。
