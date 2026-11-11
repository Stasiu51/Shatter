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

// Stop separator for multi-colour (gradient) values. A '|' is used rather than
// a comma because a comma is already meaningful inside the "(r,g,b,a)" tuple
// form accepted by parseCssColor, and because '|' survives both the pragma
// tokenizer (unquoted values are [^\s]+) and the URL hash codec in
// src/io/url_sync.js (which rewrites spaces, not pipes).
export const COLOUR_STOP_SEP = '|';

/**
 * Parse a colour value that may carry several stops, as in
 * "#ff0000|#0000ff" or "(255,0,0)|(0,0,255)" or "gold|violet|cornflowerblue".
 *
 * A value with no '|' is a single colour and is parsed exactly as before, so
 * every existing COLOUR= value (including bare "r,g,b" tuples) is unaffected.
 *
 * @param {*} val
 * @returns {string[]} Zero or more CSS colour strings, in declaration order.
 */
export function parseColourStops(val) {
  if (val === undefined || val === null) return [];
  const raw = String(val);
  if (!raw.includes(COLOUR_STOP_SEP)) {
    const one = parseCssColor(raw);
    return (one && String(one).trim().length) ? [one] : [];
  }
  const out = [];
  for (const part of raw.split(COLOUR_STOP_SEP)) {
    const t = part.trim();
    if (!t) continue;                 // tolerate "a||b" and trailing separators
    const c = parseCssColor(t);
    if (c && String(c).trim().length) out.push(c);
  }
  return out;
}

/**
 * A CSS background value that previews a colour value, so a multi-stop value
 * shows as a gradient swatch instead of as an invalid colour.
 * @param {*} val
 * @returns {string}
 */
export function colourSwatchCss(val) {
  const stops = parseColourStops(val);
  if (stops.length === 0) return 'transparent';
  if (stops.length === 1) return stops[0];
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
