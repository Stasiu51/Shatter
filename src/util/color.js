// Utility: parse a CSS-like color string.
// Accepts CSS names and hex strings as-is, and also numeric tuples like
// "(r,g,b,a)" or "r,g,b,a" where r,g,b are either 0..1 (scaled to 255) or 0..255.
export function parseCssColor(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  // Tuple forms: (r,g,b) or (r,g,b,a) or without parens, numbers separated by commas.
  if (/^\(?\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(\s*,\s*[\d.]+\s*)?\)?$/.test(s)) {
    const nums = s.replace(/[()]/g, '').split(',').map(t => Number(t.trim()));
    let [r, g, b, a] = [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
    const scale = (r > 1 || g > 1 || b > 1) ? 1 : 255;
    const R = Math.max(0, Math.min(255, Math.round(r * scale)));
    const G = Math.max(0, Math.min(255, Math.round(g * scale)));
    const B = Math.max(0, Math.min(255, Math.round(b * scale)));
    const A = a > 1 ? Math.max(0, Math.min(1, a / 255)) : Math.max(0, Math.min(1, a));
    return `rgba(${R}, ${G}, ${B}, ${A})`;
  }
  return s; // pass-through CSS color strings
}

