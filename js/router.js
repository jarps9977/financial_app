// Hash routing works on GitHub Pages without server rewrites
const routes = [];

export function route(pattern, load) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ re, keys, load });
}

export function match(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = {};
    try {
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    } catch {
      return null;
    }
    return { load: r.load, params };
  }
  return null;
}

export const currentPath = () => location.hash.slice(1) || '/';

export function navigate(path) {
  location.hash = `#${path}`;
}
