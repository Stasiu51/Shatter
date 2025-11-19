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
      this.selected.add(id);
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
      if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
      this.kind = this.selected.size > 0 ? (this.kind ?? kind) : null;
      this._emit();
      return { conflict: false };
    }
    // shift = union/add
    this.selected.add(id);
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
    this._emit();
  }
}

export const selectionStore = new SelectionStore();
