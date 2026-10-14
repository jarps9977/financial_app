const SVG_NS = 'http://www.w3.org/2000/svg';

// Children are always added as nodes or text, never parsed as HTML
export function toNodes(children) {
  return [children].flat(Infinity)
    .filter((c) => c != null && c !== false && c !== true)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c))));
}

function build(el, props, children) {
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'value') value = v;
    else if (k === 'style') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...toNodes(children));
  // Set after children so <select> can match an option
  if (value !== undefined) el.value = value;
  return el;
}

export const h = (tag, props, ...children) => build(document.createElement(tag), props, children);
export const s = (tag, props, ...children) => build(document.createElementNS(SVG_NS, tag), props, children);
