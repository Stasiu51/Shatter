import { parseCssColor } from '../util/color.js';

const LS_KEY = 'customQubitColors.v1';
function loadCustom() { try { const raw = localStorage.getItem(LS_KEY); return Array.isArray(JSON.parse(raw)) ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); } }
function saveCustom(set) { try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {} }

// Default qubit fill colour: white
const DEFAULT_QUBIT_COLOR = '#ffffff';

function normColor(c) { try { return String(parseCssColor(c) || c).toLowerCase(); } catch { return String(c || '').toLowerCase(); } }

export function renderQubitsPalette({ containerEl, circuit, onAdd }) {
  if (!containerEl || !circuit) return;
  containerEl.innerHTML = '';
  // Header
  const hdr = document.createElement('div');
  hdr.textContent = 'Add Qubit';
  hdr.style.fontWeight = '600';
  hdr.style.fontSize = '12px';
  hdr.style.color = 'var(--text)';
  hdr.style.textAlign = 'center';
  containerEl.appendChild(hdr);

  // Gather colours from qubit metadata + defaults + custom
  const colors = new Set([normColor(DEFAULT_QUBIT_COLOR)]);
  const custom = loadCustom();
  try {
    for (const q of circuit.qubits?.values?.() || []) {
      if (q && q.colour) colors.add(normColor(q.colour));
    }
  } catch {}
  for (const c of custom) colors.add(c);

  // Known extant colours (in use) to control removal affordance
  const extant = new Set();
  try { for (const q of circuit.qubits?.values?.() || []) { if (q && q.colour) extant.add(normColor(q.colour)); } } catch {}
  extant.add(normColor(DEFAULT_QUBIT_COLOR));

  // Grid of colour boxes
  const grid = document.createElement('div');
  grid.style.display = 'flex';
  grid.style.flexWrap = 'wrap';
  grid.style.gap = '6px';
  grid.style.justifyContent = 'center';
  grid.style.padding = '2px 0 4px 0';
  for (const c of colors) {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    const box = document.createElement('div');
    box.title = c;
    box.style.width = '20px';
    box.style.height = '20px';
    box.style.border = '1px solid var(--border)';
    box.style.background = c;
    box.style.borderRadius = '4px';
    box.style.cursor = 'pointer';
    box.onclick = (e) => { e.stopPropagation(); try { if (typeof onAdd === 'function') onAdd(c); } catch {} };
    wrap.appendChild(box);
    const isCustom = custom.has(c);
    const isExtant = extant.has(c);
    if (isCustom && !isExtant) {
      const close = document.createElement('div');
      close.textContent = '×';
      close.style.position = 'absolute';
      close.style.top = '-6px'; close.style.right = '-6px';
      close.style.width = '14px'; close.style.height = '14px';
      close.style.borderRadius = '50%';
      close.style.background = 'var(--bg, #fff)';
      close.style.color = 'var(--text)';
      close.style.fontSize = '10px';
      close.style.display = 'flex'; close.style.alignItems = 'center'; close.style.justifyContent = 'center';
      close.style.cursor = 'pointer';
      close.title = 'Remove';
      close.onclick = () => { custom.delete(c); saveCustom(custom); renderQubitsPalette({ containerEl, circuit, onAdd }); };
      wrap.appendChild(close);
    }
    grid.appendChild(wrap);
  }
  // '+' box
  const plus = document.createElement('div');
  plus.title = 'Add color';
  plus.style.width = '20px'; plus.style.height = '20px';
  plus.style.border = '1px solid var(--border)'; plus.style.borderRadius = '4px';
  plus.style.display = 'flex'; plus.style.alignItems = 'center'; plus.style.justifyContent = 'center';
  plus.style.cursor = 'pointer'; plus.style.color = 'var(--text)';
  plus.textContent = '+';
  plus.onclick = async (ev) => {
    ev.stopPropagation();
    try {
      const mod = await import('../vendor/vanilla-picker.mjs');
      const Picker = mod.default || mod;
      const picker = new Picker({ parent: document.body, popup: 'bottom', alpha: false, color: DEFAULT_QUBIT_COLOR });
      picker.onDone = (color) => {
        try {
          const hex = color.hexString || color.rgbaString;
          const norm = normColor(hex);
          if (norm) { custom.add(norm); saveCustom(custom); }
        } finally {
          try { picker.hide(); } catch {}
          try { picker.destroy(); } catch {}
          renderQubitsPalette({ containerEl, circuit, onAdd });
        }
      };
      picker.onClose = () => { try { picker.hide(); picker.destroy(); } catch {} };
      picker.show();
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
