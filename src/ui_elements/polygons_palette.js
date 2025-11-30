import { parseCssColor } from '../util/color.js';

// Default Crumble polygon colors: blue, red, green at alpha 0.25
const DEFAULT_POLY_COLORS = [
  'rgba(0, 0, 255, 0.25)',  // blue
  'rgba(255, 0, 0, 0.25)',  // red
  'rgba(0, 255, 0, 0.25)',  // green
];

const LS_KEY = 'customPolygonColors.v1';

function loadCustom() {
  try { const raw = localStorage.getItem(LS_KEY); return Array.isArray(JSON.parse(raw)) ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); }
}
function saveCustom(set) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
}
function normCssColor(val) {
  try {
    const c = parseCssColor(String(val||'').trim());
    return (c || '').toLowerCase().replace(/\s+/g, ' ');
  } catch { return String(val||'').toLowerCase(); }
}

function toCssRgba(fillStr) {
  if (!fillStr) return null;
  // Expect forms like '(r,g,b,a)' — convert to rgba string via parseCssColor.
  try {
    const s = String(fillStr).trim().replace(/[()]/g, '');
    const c = parseCssColor(s);
    return c;
  } catch {
    return null;
  }
}

export function renderPolygonsPalette({ containerEl, circuit }) {
  if (!containerEl || !circuit) return;
  containerEl.innerHTML = '';
  // Header
  const hdr = document.createElement('div');
  hdr.textContent = 'Add Polygon';
  hdr.style.fontWeight = '600';
  hdr.style.fontSize = '12px';
  hdr.style.color = 'var(--text)';
  hdr.style.textAlign = 'center';
  containerEl.appendChild(hdr);

  // Collect colors
  const colors = new Set(DEFAULT_POLY_COLORS.map(normCssColor));
  const custom = loadCustom();
  try {
    for (const layer of circuit.layers || []) {
      const anns = layer.annotations || [];
      for (const a of anns) {
        if (!a || a.kind !== 'Polygon') continue;
        const c = normCssColor(toCssRgba(a.fill));
        if (c && !colors.has(c)) colors.add(c);
      }
    }
  } catch {}
  // Include custom
  for (const c of custom) colors.add(c);

  // Grid of color boxes
  const grid = document.createElement('div');
  grid.style.display = 'flex';
  grid.style.flexWrap = 'wrap';
  grid.style.gap = '6px';
  grid.style.justifyContent = 'center';
  grid.style.padding = '2px 0 4px 0';
  // Helper to know if color is extant (present in circuit) or default
  const extant = new Set();
  try {
    for (const layer of circuit.layers || []) {
      for (const a of (layer.annotations || [])) {
        if (a && a.kind === 'Polygon') {
          const c = normCssColor(toCssRgba(a.fill));
          if (c) extant.add(c);
        }
      }
    }
  } catch {}

  for (const c of colors) {
    const boxWrap = document.createElement('div');
    boxWrap.style.position = 'relative';
    const box = document.createElement('div');
    box.title = c;
    box.style.width = '20px';
    box.style.height = '20px';
    box.style.border = '1px solid var(--border)';
    box.style.background = c;
    box.style.borderRadius = '4px';
    boxWrap.appendChild(box);
    // Remove 'x' if custom and not extant
    const isCustom = custom.has(c);
    const isExtant = extant.has(c) || DEFAULT_POLY_COLORS.map(normCssColor).includes(c);
    if (isCustom && !isExtant) {
      const close = document.createElement('div');
      close.textContent = '×';
      close.style.position = 'absolute';
      close.style.top = '-6px';
      close.style.right = '-6px';
      close.style.width = '14px';
      close.style.height = '14px';
      close.style.borderRadius = '50%';
      close.style.background = 'var(--bg, #fff)';
      close.style.color = 'var(--text)';
      close.style.fontSize = '10px';
      close.style.display = 'flex';
      close.style.alignItems = 'center';
      close.style.justifyContent = 'center';
      close.style.cursor = 'pointer';
      close.title = 'Remove';
      close.onclick = () => { custom.delete(c); saveCustom(custom); renderPolygonsPalette({ containerEl, circuit }); };
      boxWrap.appendChild(close);
    }
    grid.appendChild(boxWrap);
  }
  // '+' box
  const plus = document.createElement('div');
  plus.title = 'Add color';
  plus.style.width = '20px';
  plus.style.height = '20px';
  plus.style.border = '1px solid var(--border)';
  plus.style.borderRadius = '4px';
  plus.style.display = 'flex';
  plus.style.alignItems = 'center';
  plus.style.justifyContent = 'center';
  plus.style.cursor = 'pointer';
  plus.style.color = 'var(--text)';
  plus.textContent = '+';
  plus.onclick = async (ev) => {
    ev.stopPropagation();
    try {
      const mod = await import('../vendor/vanilla-picker.mjs');
      const Picker = mod.default || mod;
      // Use body as parent and position below the "+" like the original code.
      const picker = new Picker({ parent: document.body, popup: 'bottom', alpha: true, color: DEFAULT_POLY_COLORS[0] });
      picker.onDone = (color) => {
        try {
          const rgba = color.rgbaString;
          const norm = normCssColor(rgba);
          if (norm) { custom.add(norm); saveCustom(custom); }
        } finally {
          try { picker.hide(); } catch {}
          try { picker.destroy(); } catch {}
          renderPolygonsPalette({ containerEl, circuit });
        }
      };
      picker.onClose = () => { try { picker.hide(); picker.destroy(); } catch {} };
      picker.show();
      // Reposition and elevate popup near the plus box; scale down (original behavior), below the plus.
      try {
        const dom = picker.domElement;
        const rect = plus.getBoundingClientRect();
        dom.style.position = 'fixed';
        dom.style.left = Math.round(rect.left) + 'px';
        dom.style.top = Math.round(rect.bottom + 4) + 'px';
        dom.style.zIndex = '2147483647';
        dom.style.transformOrigin = 'top left';
        dom.style.transform = 'scale(0.5)';
      } catch {}
    } catch (e) {
      console.warn('Picker load failed', e);
    }
  };
  grid.appendChild(plus);
  containerEl.appendChild(grid);
}
