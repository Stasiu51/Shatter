// URL circuit sync helpers derived from Stim/Crumble (Apache 2.0).
// Crumble encodes the circuit into the URL hash as `#circuit=...` by
// abbreviating common tokens, compacting whitespace, and replacing newlines.
// We mirror that here so links are short and GitHub Pages-friendly.

/**
 * Encode a Stim/overlay text into a compact `#circuit=...` hash string.
 * - Abbreviate QUBIT_COORDS/DETECTOR/OBSERVABLE_INCLUDE
 * - Strip trivial spaces
 * - Replace spaces with '_' and newlines with ';'
 * - Percent-encode only when necessary (when '%' or '&' present)
 * @param {string} text
 * @returns {string}
 */
export function encodeCircuitToHash(text) {
  let s = String(text || '');
  s = s
    .replaceAll('QUBIT_COORDS', 'Q')
    .replaceAll('DETECTOR', 'DT')
    .replaceAll('OBSERVABLE_INCLUDE', 'OI')
    .replaceAll(', ', ',')
    .replaceAll(') ', ')')
    .replaceAll(' ', '_')
    .replaceAll('\n', ';');
  if (s.includes('%') || s.includes('&')) s = encodeURIComponent(s);
  return '#circuit=' + s;
}

/**
 * Parse the location.hash into a Map of key->value, decoding percent-encoding.
 * @returns {Map<string,string>}
 */
export function parseHashParams() {
  const raw = (typeof location !== 'undefined' && location.hash) ? location.hash : '';
  const h = raw.startsWith('#') ? raw.substring(1) : raw;
  const m = new Map();
  if (!h) return m;
  for (const kv of h.split('&')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const k = kv.substring(0, i);
    const v = decodeURIComponent(kv.substring(i + 1));
    m.set(k, v);
  }
  return m;
}

/**
 * Replace the current hash with the encoded circuit, preserving no other keys.
 * Uses replaceState to avoid spamming history.
 * @param {string} text
 */
export function writeHashFromCircuit(text) {
  try {
    const hash = encodeCircuitToHash(text || '');
    history.replaceState(null, '', hash);
  } catch {}
}

