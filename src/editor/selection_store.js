// Simple global selection/hover store with subscription.

/** @typedef {'gate'|'qubit'|'connection'|'polygon'|null} SelKind */

class SelectionStore {
  constructor() {
    /** @type {SelKind} */
    this.kind = null;
    /** @type {{kind:SelKind, id:string}|null} */
    this.hover = null;
    /** @type {Set<string>} */
    this.selected = new Set();
    // Stable selection indices and colors.
    /** @type {Map<string, number>} */
    this.id2index = new Map();
    /** @type {Map<number, string>} */
    this.index2id = new Map();
    /** @type {Map<number, string>} */
    this.index2color = new Map();
    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _emit() {
    for (const fn of this.listeners) {
      try { fn(this.snapshot()); } catch {}
    }
  }
  snapshot() {
    return { kind: this.kind, hover: this.hover, selected: new Set(this.selected) };
  }
  clear() {
    this.kind = null;
    this.hover = null;
    this.selected.clear();
    this.id2index.clear();
    this.index2id.clear();
    this._emit();
  }
  setHover(hit) {
    const prev = this.hover?.id;
    this.hover = hit ? { kind: hit.kind, id: hit.id } : null;
    if (prev !== this.hover?.id) this._emit();
  }
  /**
   * @param {{kind:SelKind,id:string}|null} hit
   * @param {{shift?:boolean, ctrl?:boolean}} mods
   * @returns {{conflict:boolean}}
   */
  applySelection(hit, mods={}) {
    if (!hit) return { conflict: false };
    const { kind, id } = hit;
    // Replace selection (no multi-select modifiers): always switch kind.
    if (!mods.shift && !mods.ctrl) {
      // Replace selection.
      this.selected.clear();
      // Reset index mappings.
      this.id2index.clear();
      this.index2id.clear();
      // Assign index 0 to the new item.
      this.selected.add(id);
      this._assignIndex(id, 0);
      this.kind = kind;
      this._emit();
      return { conflict: false };
    }
    // Enforce single kind only when attempting multi-select.
    if (this.selected.size > 0 && this.kind && this.kind !== kind) {
      return { conflict: true };
    }
    if (mods.ctrl) {
      // XOR toggle.
      if (this.selected.has(id)) {
        this.selected.delete(id);
        this._freeIndex(id);
      } else {
        this.selected.add(id);
        this._assignIndex(id, this._lowestAvailableIndex());
      }
      this.kind = this.selected.size > 0 ? (this.kind ?? kind) : null;
      this._emit();
      return { conflict: false };
    }
    // shift = union/add
    if (!this.selected.has(id)) {
      this.selected.add(id);
      this._assignIndex(id, this._lowestAvailableIndex());
    }
    this.kind = this.kind ?? kind;
    this._emit();
    return { conflict: false };
  }

  /**
   * Replace entire selection and kind.
   * @param {SelKind} kind
   * @param {Iterable<string>} ids
   */
  replace(kind, ids) {
    this.selected = new Set(ids);
    this.kind = this.selected.size > 0 ? kind : null;
    // Reassign indices compactly from lowest available upward to maintain minimal indices.
    const oldIndex2color = new Map(this.index2color);
    this.id2index.clear();
    this.index2id.clear();
    let i = 0;
    for (const id of this.selected) {
      this._assignIndex(id, i++);
    }
    // Keep previously generated colors to preserve appearance when possible.
    for (const [idx, col] of oldIndex2color.entries()) {
      if (!this.index2color.has(idx)) this.index2color.set(idx, col);
    }
    this._emit();
  }

  /** @returns {Array<{id:string, kind:SelKind, index:number, color:string}>} */
  orderedEntries() {
    const out = [];
    for (const id of this.selected) {
      const idx = this.id2index.get(id);
      if (idx === undefined) continue;
      out.push({ id, kind: this.kind, index: idx, color: this.getColorFor(id) });
    }
    out.sort((a,b) => a.index - b.index);
    return out;
  }

  /** @param {string} id */
  getColorFor(id) {
    const idx = this.id2index.get(id);
    if (idx === undefined) return '#1e90ff';
    if (this.index2color.has(idx)) return this.index2color.get(idx);
    const col = this._colorForIndex(idx);
    this.index2color.set(idx, col);
    return col;
  }

  // --- internals ---
  _lowestAvailableIndex() {
    let i = 0;
    while (this.index2id.has(i)) i++;
    return i;
  }
  _assignIndex(id, idx) {
    this.id2index.set(id, idx);
    this.index2id.set(idx, id);
  }
  _freeIndex(id) {
    const idx = this.id2index.get(id);
    if (idx !== undefined) {
      this.id2index.delete(id);
      this.index2id.delete(idx);
    }
  }
  _colorForIndex(idx) {
    const palette = SELECTION_PALETTE;
    if (idx < palette.length) return palette[idx];
    const h = Math.random() * 360;
    const s = 0.5 + Math.random() * 0.5;
    const v = 0.5 + Math.random() * 0.5;
    return hsvToHex(h, s, v);
  }
}

// Hand-picked high-contrast palette (extend as needed)
const SELECTION_PALETTE = [
  '#1e90ff', // dodger blue
  '#ff7f0e', // orange
  '#2ca02c', // green
  '#d62728', // red
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#7f7f7f', // gray
  '#bcbd22', // olive
  '#17becf', // teal
];

function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r1=0, g1=0, b1=0;
  if (h < 60)      { r1=c; g1=x; b1=0; }
  else if (h < 120){ r1=x; g1=c; b1=0; }
  else if (h < 180){ r1=0; g1=c; b1=x; }
  else if (h < 240){ r1=0; g1=x; b1=c; }
  else if (h < 300){ r1=x; g1=0; b1=c; }
  else             { r1=c; g1=0; b1=x; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

export const selectionStore = new SelectionStore();
