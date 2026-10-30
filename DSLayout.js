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