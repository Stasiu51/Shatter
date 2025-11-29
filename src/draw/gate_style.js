// Global gate-connector style shared by draw paths.
// Fields: { droop?: number, colour?: string }

let _gateStyle = {};

export function setGateStyle(style) {
  try {
    if (!style || typeof style !== 'object') { _gateStyle = {}; return; }
    const out = {};
    if (typeof style.droop === 'number' && isFinite(style.droop)) out.droop = style.droop;
    if (typeof style.colour === 'string' && style.colour.length) out.colour = style.colour;
    if (typeof style.thickness === 'number' && isFinite(style.thickness)) out.thickness = style.thickness;
    _gateStyle = out;
  } catch { _gateStyle = {}; }
}

export function getGateStyle() {
  return _gateStyle || {};
}
