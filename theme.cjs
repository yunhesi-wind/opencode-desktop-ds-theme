// The stable internal ID preserves users' existing theme selection.
const THEME_ID = 'ds-deepsea';
const THEME_NAME = '深海大肥鱼';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Unsupported selectable-theme hook: ' + before.slice(0, 100));
  return source.replace(before, after);
}

function rootColors(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const first = /^\s*:root\[data-theme\]\[data-color-scheme\],[\s\S]*?\{([^{}]*)\}/.exec(clean);
  if (!first) throw new Error('Unsupported DS root color block.');
  return Object.fromEntries([...first[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

function splitSelectors(source) {
  const result = [];
  let start = 0, depth = 0, quote = '', escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) { result.push(source.slice(start, i).trim()); start = i + 1; }
    if (depth < 0) throw new Error('Unbalanced DS selector.');
  }
  if (depth || quote || escaped) throw new Error('Unbalanced DS selector.');
  result.push(source.slice(start).trim());
  if (result.some((selector) => !selector)) throw new Error('Empty DS selector.');
  return result;
}

function scopeCss(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@|<\/style/i.test(clean)) throw new Error('Unsupported scoped CSS construct.');
  const gate = '[data-theme="' + THEME_ID + '"]';
  let end = 0;
  const rules = [];
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (clean.slice(end, match.index).trim()) throw new Error('Unsupported CSS nesting.');
    const selectors = splitSelectors(match[1]).map((selector) => {
      if (/^:root\b/.test(selector)) return selector.replace(/^:root\b/, ':root' + gate);
      if (/^html\b/.test(selector)) return selector.replace(/^html\b/, 'html' + gate);
      return ':root' + gate + ' ' + selector;
    });
    rules.push(selectors.join(',\n') + ' {' + match[2] + '}');
    end = match.index + match[0].length;
  }
  if (!rules.length || clean.slice(end).trim()) throw new Error('Unsupported CSS structure.');
  return rules.join('\n\n') + '\n';
}

function patchRenderer(source, css) {
  if (source.includes('ds-deepsea')) throw new Error('Renderer already contains the selectable theme.');
  const overrides = JSON.stringify(rootColors(css));
  // Native theme data, not the CLI theme format. Clone the native dark theme; do not mutate it.
  const loader = `"./themes/${THEME_ID}.json":()=>{const t=structuredClone(jo);t.id=${JSON.stringify(THEME_ID)};t.name=${JSON.stringify(THEME_NAME)};t.dark.overrides={...t.dark.overrides,...${overrides}};t.light=structuredClone(t.dark);return Promise.resolve({default:t})},`;
  let output = replaceOnce(source, 'function Do(){return wo||(wo=Object.assign({',
    'function Do(){return wo||(wo=Object.assign({' + loader);
  output = replaceOnce(output, 'var Ao={"oc-2":`OpenCode`,',
    'var Ao={' + JSON.stringify(THEME_ID) + ':' + JSON.stringify(THEME_NAME) + ',"oc-2":`OpenCode`,');
  // Resolve DS as dark without changing the saved system/light/dark preference.
  output = replaceOnce(output, 'l=(t,n,r,i)=>{zo(t,n,r),e.onThemeApplied?.(t,r,i)}',
    'l=(t,n,r,i)=>{r=n===' + JSON.stringify(THEME_ID) + '?`dark`:r;zo(t,n,r),e.onThemeApplied?.(t,r,i)}');
  output = replaceOnce(output, 'mode:()=>a.mode,ids:u,',
    'mode:()=>(a.previewThemeId??a.themeId)===' + JSON.stringify(THEME_ID) + '?`dark`:a.mode,ids:u,');
  return output;
}

// Runs only in the renderer. No persistence writes, model calls or server connections.
function videoController(id, filename) {
  const video = document.getElementById('opencode-bg-video');
  if (!video) return;
  let active = false;
  const sync = () => {
    const selected = document.documentElement.dataset.theme === id;
    if (selected === active) return;
    active = selected;
    if (selected) {
      video.hidden = false;
      video.muted = true;
      video.src = filename;
      const playing = video.play();
      if (playing?.catch) playing.catch(() => {}); // Autoplay may be denied by the browser.
    } else {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.hidden = true;
    }
  };
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  sync();
}

function injectHtml(html, css) {
  if ((html.match(/<\/head>/g) || []).length !== 1 ||
      (html.match(/<body\b[^>]*>/gi) || []).length !== 1 || /opencode-bg-(?:video|correct-override)/.test(html)) {
    throw new Error('Unsupported or already themed HTML.');
  }
  const video = '<video id="opencode-bg-video" aria-hidden="true" hidden loop muted playsinline></video>';
  const controller = '<script id="ds-selectable-video">(' + videoController.toString() + ')(' +
    JSON.stringify(THEME_ID) + ',"./assets/deepseek-bg.mp4");</script>';
  return html.replace(/(<body\b[^>]*>)/i, '$1\n' + video + controller)
    .replace('</head>', '<style id="opencode-bg-correct-override">' + scopeCss(css) + '</style>\n</head>');
}

module.exports = { THEME_ID, THEME_NAME, replaceOnce, rootColors, splitSelectors, scopeCss, patchRenderer, videoController, injectHtml };
