// Builds DOM via createElement/textContent only, so sheet data is never parsed as HTML
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...toNodes(children).map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return el;
}

export const toNodes = (list) => [list].flat(Infinity).filter((n) => n != null && n !== false && n !== '');
