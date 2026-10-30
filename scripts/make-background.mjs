import { writeFileSync } from "node:fs"

// 动画只发生在 SVG 图片内部（SMIL），官方 DOM 不新增任何动画属性。
// 用两个大色斑缓慢漂移 + 呼吸，幅度足够肉眼可见，但不闪烁。
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="a" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2f6ea8" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#2f6ea8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1d3f6e" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#1d3f6e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="1000" fill="#071321"/>
  <g>
    <ellipse cx="380" cy="260" rx="900" ry="620" fill="url(#a)">
      <animate attributeName="cx" values="380;620;380" dur="28s" repeatCount="indefinite"/>
      <animate attributeName="cy" values="260;380;260" dur="34s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.75;1;0.75" dur="18s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="1250" cy="780" rx="820" ry="560" fill="url(#b)">
      <animate attributeName="cx" values="1250;1020;1250" dur="32s" repeatCount="indefinite"/>
      <animate attributeName="cy" values="780;640;780" dur="26s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.7;1;0.7" dur="22s" repeatCount="indefinite"/>
    </ellipse>
  </g>
</svg>`

const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
writeFileSync(new URL("../src/background.generated.css", import.meta.url),
  `/* 仅图片内部动画，不修改官方 CSS 动画。 */\nhtml { background-image: url("${uri}") !important; }\n`,
)
console.log("background.generated.css written")
