// Lightweight chord controller for toolbox-style column+row key holds.
// - Holds: column bind keys (e.g., 'm' or 'mc' for Measure / Measure Pair)
// - Tap: row axis 'x'|'y'|'z' to trigger gate placement
// - P chord: hold 'p', tap axis to choose MARK{X|Y|Z}, then press 0-9 to toggle that index

import { labelToGateId } from '../ui_elements/markers_renderer.js';

function normBinder(b) {
  // Accept forms like 'M+C' or 'mc' → 'mc' (letters only, lowercase)
  return String(b || '').toLowerCase().replace(/[^a-z]/g, '');
}

function binderSatisfied(held, binder) {
  if (!binder) return false;
  for (const ch of binder) if (!held.has(ch)) return false;
  return true;
}

// Map column id to our toolbox column index
const COL_ID_TO_INDEX = new Map([
  ['H', 0],
  ['S', 1],
  // 2 is Reset; we intentionally don't chord it unless configured
  ['M', 3],
  ['MR', 4],
  ['C', 5],
  ['W', 6],
  ['SC', 7],
  ['MC', 8],
  ['MP', 9],
]);

// Label tables matching markers_renderer
const X_LABELS = ['H_YZ', 'S_X',    'RX', 'MX', 'MRX', 'CX', 'CXSWAP', '√XX', 'M_XX', 'MPP_X'];
const Y_LABELS = ['H',    'S_Y',    'RY', 'MY', 'MRY', 'CY', 'SWAP',   '√YY', 'M_YY', 'MPP_Y'];
const Z_LABELS = ['H_XY', 'S',      'R',  'M',  'MR',  'CZ', 'CZSWAP', '√ZZ', 'M_ZZ', 'MPP_Z'];

export function createChordsController(opts) {
  const {
    isEditing = () => false,
    getSettings = () => null,
    onTriggerGate = (gateId) => {},
    onToggleMark = (basis, index) => {},
    pushStatus = () => {},
    onHighlightChanged = () => {}, // triggers UI redraw
    canToggleMarks = () => false,
  } = opts || {};

  const held = new Set(); // lowercase letters currently down
  let pendingMark = null; // 'MARKX' | 'MARKY' | 'MARKZ'
  let highlightCol = -1; // toolbox column index for visual tint

  function getChordsConfig() {
    const s = getSettings?.();
    const chords = (s && s.chords) || {};
    // Default binders
    const d = {
      H: 'H', S: 'S', M: 'M', MR: 'M+R', C: 'C', W: 'W', SC: 'S+C', MC: 'M+C', MP: 'M+P',
      P: 'P', X: 'X', Y: 'Y', Z: 'Z',
    };
    return { ...d, ...chords };
  }

  function computeActiveColumnBinder() {
    const cfg = getChordsConfig();
    // Evaluate binders in descending length to prefer combos (e.g., MC over M)
    const entries = Object.entries({ H: cfg.H, S: cfg.S, M: cfg.M, MR: cfg.MR, C: cfg.C, W: cfg.W, SC: cfg.SC, MC: cfg.MC, MP: cfg.MP });
    const sorted = entries.sort((a,b) => normBinder(b[1]).length - normBinder(a[1]).length);
    for (const [id, bind] of sorted) {
      const b = normBinder(bind);
      if (!b) continue;
      if (binderSatisfied(held, b)) return id;
    }
    return null;
  }

  function axisForKey(k) {
    const cfg = getChordsConfig();
    const key = k.toLowerCase();
    if (key === String(cfg.X || 'x').toLowerCase()) return 'X';
    if (key === String(cfg.Y || 'y').toLowerCase()) return 'Y';
    if (key === String(cfg.Z || 'z').toLowerCase()) return 'Z';
    return null;
  }

  function isPChordHeld() {
    const cfg = getChordsConfig();
    const b = normBinder(cfg.P || 'p');
    // Suppress P-chord when a more specific column chord is active (e.g., MP)
    if (computeActiveColumnBinder()) return false;
    return binderSatisfied(held, b);
  }

  function updateHighlight() {
    const colId = computeActiveColumnBinder();
    const idx = COL_ID_TO_INDEX.has(colId || '') ? COL_ID_TO_INDEX.get(colId) : -1;
    const pHeld = isPChordHeld();
    if (idx !== highlightCol) {
      highlightCol = idx;
      onHighlightChanged?.(highlightCol, pHeld);
    }
    onHighlightChanged?.(highlightCol, pHeld);
  }

  function tryTriggerGate(axis) {
    const colId = computeActiveColumnBinder();
    if (!colId) return false;
    const colIdx = COL_ID_TO_INDEX.get(colId);
    if (colIdx === undefined) return false;
    const label = axis === 'X' ? X_LABELS[colIdx] : axis === 'Y' ? Y_LABELS[colIdx] : Z_LABELS[colIdx];
    const gateId = labelToGateId(label);
    if (!gateId) return false;
    onTriggerGate(gateId);
    return true;
  }

  function handleKeyDown(ev) {
    if (isEditing?.()) return;
    const k = (ev.key || '').toLowerCase();
    if (!k) return;
    // Track held letters
    if (/^[a-z]$/.test(k)) held.add(k);

    // P chord: axis choose
    if (isPChordHeld()) {
      const ax = axisForKey(k);
      if (ax && !pendingMark) {
        // Require a selection; otherwise cancel with message.
        if (!canToggleMarks?.()) {
          pushStatus(`Select items to toggle ${ax} marks.`, 'warning');
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        pendingMark = ax === 'X' ? 'MARKX' : ax === 'Y' ? 'MARKY' : 'MARKZ';
        pushStatus(`Press 0–9 to toggle ${ax} support on that marker. Esc to cancel.`, 'info');
        ev.preventDefault(); ev.stopPropagation();
        return;
      }
    }

    // Pending mark expects a digit or escape
    if (pendingMark) {
      if (k === 'escape') { pendingMark = null; pushStatus('Canceled mark toggle.', 'info'); ev.preventDefault(); ev.stopPropagation(); return; }
      const digit = ev.key && ev.key.length === 1 && /[0-9]/.test(ev.key) ? parseInt(ev.key) : NaN;
      if (Number.isInteger(digit)) {
        onToggleMark(pendingMark, digit);
        pendingMark = null;
        ev.preventDefault(); ev.stopPropagation();
        return;
      }
    }

    // Column chord + axis triggers gate
    const ax2 = axisForKey(k);
    if (ax2) {
      if (tryTriggerGate(ax2)) { ev.preventDefault(); ev.stopPropagation(); return; }
    }

    updateHighlight();
  }

  function handleKeyUp(ev) {
    const k = (ev.key || '').toLowerCase();
    if (/^[a-z]$/.test(k)) held.delete(k);
    updateHighlight();
  }

  function attach() {
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
  }
  function detach() {
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('keyup', handleKeyUp, true);
  }

  return {
    attach,
    detach,
    getHighlight: () => highlightCol,
    isMarksHeld: () => isPChordHeld(),
  };
}
