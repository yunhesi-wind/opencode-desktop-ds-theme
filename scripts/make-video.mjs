import { existsSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = "D:/project/AI_test/opencode桌面端ds美化/assets/zipzip-1080p.mp4"
const outFile = path.join(root, "src/video.generated.ts")

function write(uri, note) {
  writeFileSync(
    outFile,
    `// 由 scripts/make-video.mjs 生成，请勿手改。${note}\nexport default ${JSON.stringify(uri)}\n`,
  )
}

if (!existsSync(source)) {
  write("", " 源视频不存在，视频层自动禁用。")
  console.log("video source missing; generated empty uri")
  process.exit(0)
}

const ffmpeg = path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe")

// 默认直接内嵌原片；DS_VIDEO_COMPRESS=1 时才转码（用于体积敏感的场景）。
if (process.env.DS_VIDEO_COMPRESS !== "1") {
  const raw = (await import("node:fs")).readFileSync(source)
  const uri = `data:video/mp4;base64,${raw.toString("base64")}`
  write(uri, ` 原片直嵌 ${(raw.length / 1024 / 1024).toFixed(2)} MB（未转码）。`)
  console.log(`video generated (raw): ${(raw.length / 1024 / 1024).toFixed(2)} MB`)
  process.exit(0)
}

if (!existsSync(ffmpeg)) {
  write("", " 未安装 ffmpeg-static，视频层自动禁用。")
  console.log("ffmpeg-static missing; generated empty uri")
  process.exit(0)
}

const tmp = path.join(root, "src", "_video.tmp.mp4")
execFileSync(ffmpeg, [
  "-y", "-i", source,
  "-an",
  "-vf", "scale=1280:-2:flags=lanczos,fps=24",
  "-c:v", "libx264", "-preset", "slow", "-crf", "23",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  tmp,
], { stdio: "inherit" })

const bytes = (await import("node:fs")).readFileSync(tmp)
;(await import("node:fs")).unlinkSync(tmp)
const uri = `data:video/mp4;base64,${bytes.toString("base64")}`
write(uri, ` 压缩后 ${(bytes.length / 1024 / 1024).toFixed(2)} MB。`)
console.log(`video generated: ${(bytes.length / 1024 / 1024).toFixed(2)} MB`)
