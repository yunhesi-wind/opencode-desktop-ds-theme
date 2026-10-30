import { Schema } from "effect"
import { createEffect, createRoot, createSignal } from "solid-js"
import { Plugin, SettingsPage, Store, Style } from "@opencode/plugin/gui"
import css from "./theme.css?inline"
import motionCSS from "./background.generated.css?inline"
import videoUri from "./video.generated"

const VIDEO_ID = "ds-skin-video"

function removeVideo() {
  document.getElementById(VIDEO_ID)?.remove()
}

function syncVideo(on: boolean) {
  const existing = document.getElementById(VIDEO_ID) as HTMLVideoElement | null
  if (!on || !videoUri) {
    existing?.remove()
    return
  }
  if (existing) {
    void existing.play().catch(() => {})
    return
  }
  const video = document.createElement("video")
  video.id = VIDEO_ID
  video.muted = true
  video.loop = true
  video.autoplay = true
  video.playsInline = true
  video.setAttribute("aria-hidden", "true")
  video.setAttribute("inert", "")
  // 装饰层例外：fixed + 四边 0，不进入文档流、不参与命中。
  Object.assign(video.style, {
    position: "fixed",
    inset: "0px",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: "-1",
    pointerEvents: "none",
    opacity: "0.85",
  })
  video.src = videoUri
  document.body.append(video)
  void video.play().catch(() => {})
}

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
    console.info("[ds-skin] setup", ctx.id, ctx.app.version, ctx.app.platform)

    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const [reduced, setReduced] = createSignal(media.matches)
    const onReduced = () => setReduced(media.matches)
    media.addEventListener("change", onReduced)

    const prefs = ctx.stores.prefs

    ctx.add(Style, () => {
      if (!prefs.value.enabled) return undefined
      return css + (prefs.value.motion && !reduced() ? motionCSS : "")
    })

    // 视频层只在“启用 + 动态背景 + 帧素材存在”时挂载；不可见时暂停。
    const onVisibility = () => {
      const video = document.getElementById(VIDEO_ID) as HTMLVideoElement | null
      if (!video) return
      if (document.hidden) video.pause()
      else void video.play().catch(() => {})
    }
    document.addEventListener("visibilitychange", onVisibility)

    const dispose = createRoot((disposeRoot) => {
      createEffect(() => {
        syncVideo(prefs.value.enabled && prefs.value.motion && !reduced())
      })
      return disposeRoot
    })

    ctx.add(SettingsPage, {
      id: "deepsea-skin",
      get title() {
        return "深海皮肤"
      },
      entries: [
        { id: "enabled", title: "启用深海皮肤", keywords: "深蓝 玻璃 颜色" },
        { id: "motion", title: "动态背景", keywords: "动态 视频 静态 减少动态效果" },
      ],
      render: () => (
        <section aria-label="深海皮肤设置">
          <h2>深海皮肤</h2>
          <label>
            <input
              type="checkbox"
              checked={prefs.value.enabled}
              onChange={(event) => {
                prefs.update((draft) => { draft.enabled = event.currentTarget.checked })
              }}
            />
            启用颜色皮肤
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.value.motion}
              onChange={(event) => {
                prefs.update((draft) => { draft.motion = event.currentTarget.checked })
              }}
            />
            动态背景（窗口不可见时自动暂停）
          </label>
          <p>{videoUri ? "已内置视频背景。" : "未内置视频，动态背景使用 SVG 渐变动画。"}</p>
          <p>只改配色和背景，不新增工作区按钮、面板或快捷键。</p>
        </section>
      ),
    })

    return () => {
      dispose()
      document.removeEventListener("visibilitychange", onVisibility)
      media.removeEventListener("change", onReduced)
      removeVideo()
    }
  },
  main(ctx) {
    ctx.log.write("info", "ds-skin main started", { version: ctx.app.version })
  },
})
