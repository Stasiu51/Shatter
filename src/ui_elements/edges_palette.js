import { parseCssColor } from '../util/color.js';
const LS_KEY = 'customEdgeColors.v1';
function loadCustom() { try { const raw = localStorage.getItem(LS_KEY); return Array.isArray(JSON.parse(raw)) ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); } }
function saveCustom(set) { try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {} }

// Default edge color (aligns with draw fallback in draw_panel.js: '#b0b5ba')
const DEFAULT_EDGE_COLOR = '#b0b5ba';

function normColor(c) {
  try { return String(parseCssColor(c) || c).toLowerCase(); } catch { return String(c || '').toLowerCase(); }
}

export function renderEdgesPalette({ containerEl, circuit }) {
  if (!containerEl || !circuit) return;
  containerEl.innerHTML = '';
  // Header
  const hdr = document.createElement('div');
  hdr.textContent = 'Add Edge';
  hdr.style.fontWeight = '600';
  hdr.style.fontSize = '12px';
  hdr.style.color = 'var(--text)';
  hdr.style.textAlign = 'center';
  containerEl.appendChild(hdr);

  // Collect colors from ConnSet annotations
  const colors = new Set([normColor(DEFAULT_EDGE_COLOR)]);
  const custom = loadCustom();
  try {
    for (const layer of circuit.layers || []) {
      const anns = layer.annotations || [];
      for (const a of anns) {
        if (!a || a.kind !== 'ConnSet') continue;
        const col = a.COLOUR || a.colour;
        if (!col) continue;
        const nc = normColor(col);
        if (nc && !colors.has(nc)) colors.add(nc);
      }
    }
  } catch {}
  for (const c of custom) colors.add(c);

  // Grid of color boxes
  const grid = document.createElement('div');
  grid.style.display = 'flex';
  grid.style.flexWrap = 'wrap';
  grid.style.gap = '6px';
  grid.style.justifyContent = 'center';
  grid.style.padding = '2px 0 4px 0';
  const extant = new Set();
  try {
    for (const layer of circuit.layers || []) {
      for (const a of (layer.annotations || [])) {
        if (a && a.kind === 'ConnSet') {
          const col = a.COLOUR || a.colour;
          const nc = normColor(col);
          if (nc) extant.add(nc);
        }
      }
    }
  } catch {}
  for (const c of colors) {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    const box = document.createElement('div');
    box.title = c;
    box.style.width = '20px';
    box.style.height = '10px';
    box.style.border = '1px solid var(--border)';
    box.style.background = c;
    box.style.borderRadius = '2px';
    wrap.appendChild(box);
    const isCustom = custom.has(c);
    const isExtant = extant.has(c) || normColor(DEFAULT_EDGE_COLOR) === c;
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
      close.onclick = () => { custom.delete(c); saveCustom(custom); renderEdgesPalette({ containerEl, circuit }); };
      wrap.appendChild(close);
    }
    grid.appendChild(wrap);
  }
  // '+' box for edges
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
      const picker = new Picker({ parent: document.body, popup: 'bottom', alpha: false, color: DEFAULT_EDGE_COLOR });
      picker.onDone = (color) => {
        try {
          const hex = color.hexString || color.rgbaString;
          const norm = normColor(hex);
          if (norm) { custom.add(norm); saveCustom(custom); }
        } finally {
          try { picker.hide(); } catch {}
          try { picker.destroy(); } catch {}
          renderEdgesPalette({ containerEl, circuit });
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
