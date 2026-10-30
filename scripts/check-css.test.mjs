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
]) assert.ok(inspect(css).length, `应当拒绝：${css}`)

console.log("CSS gate regression passed")
