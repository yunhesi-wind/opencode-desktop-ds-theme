# Third-party notices / 原作署名与许可边界

## 上游主题代码

- 作者：daemon1s
- 项目：<https://github.com/daemon1s/opencode-deepseek-chan>
- 基于提交：`b59ba94581ffb2d48b4e180194c119c9661cab99`
- 许可：MIT，原版权与许可原文完整保留在 `vendor/LICENSE`。

本项目保留上游的深海女仆动态背景方向，重写部署逻辑、调整 CSS 并增加测试。
不是 OpenCode、DeepSeek 或上游作者的官方产品，不暗示上述主体背书。

## 深海女仆背景素材（不随仓库分发）

- 作品：`DeepSeek 蓝色大肥鱼 深海女仆 鲸鱼娘`
- 创作者：ZipZipPipe（Bilibili）
- 基础设计：上善无形（Bilibili）
- 发布者：HDHKVT
- 原作来源：<https://steamcommunity.com/sharedfiles/filedetails/?id=3787993441>
- 下载来源：上游 GitHub Release `v1.0.0/zipzip-1080p.mp4`
- 上游声明的许可：CC BY-NC-SA 4.0
- 许可链接：<https://creativecommons.org/licenses/by-nc-sa/4.0/>

本项目没有修改视频内容，仅提供下载、完整性校验及本机背景应用方式。
视频不属于代码 MIT 许可范围。**素材授权目前仅依据上游声明，维护者尚未独立核实原作权利链。**
用户应自行确认有权下载、使用或展示该素材；同意下载选项不等于取得版权授权。
如上述许可确实适用，应遵守署名、非商业性使用、相同方式共享及修改说明要求。
发布截图、视频或素材改编版时也应确认许可和署名；仅署名不能替代授权。

## OpenCode 与依赖

OpenCode 应用本身和它的原生模块由用户从官方获得，本仓库不分发
`app.asar`、`app.asar.unpacked`、原包备份或从应用提取的 CSS。
依赖 `@electron/asar` 通过 npm 安装，其许可由对应 package 提供。
本仓库 MIT 许可不覆盖第三方软件或背景素材，也不额外限制上游 MIT 代码的商业使用权。

## AI 辅助披露

本次部署重写、CSS 调整、测试与文档包含 OpenAI GPT 的 AI 辅助贡献，
由 yunhesi-wind 选择需求并完成本机视觉验收。AI 不代表任何机构认可或担保。
提交信息通过 `Co-authored-by: OpenAI GPT <gpt@users.noreply.github.com>` 记录该贡献；
该邮箱是说明性 attribution 标记，不保证关联到已验证的 GitHub 账号。
