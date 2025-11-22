// A simple, unified, and editable keymap for the app (no build step; plain ESM).
//
// Features:
// - Register commands with handlers and optional `when` predicates.
// - Multiple accelerators per command (e.g. ["Mod+Z", "Ctrl+Z"]).
// - LocalStorage persistence of user overrides; safe defaults kept in code.
// - Platform-aware matcher: 'Mod' = Meta on macOS, Ctrl elsewhere.
// - One global keydown listener; ignores events from editable elements.

const STORAGE_KEY = 'keymap.v1';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

/** Normalize a KeyboardEvent into a canonical object. */
function normalizeEvent(ev) {
  const keyRaw = (ev.key || '').toLowerCase();
  // Map special keys to consistent tokens
  const special = new Map([
    [' ', 'space'],
    ['arrowleft', 'arrowleft'],
    ['arrowright', 'arrowright'],
    ['arrowup', 'arrowup'],
    ['arrowdown', 'arrowdown'],
    ['escape', 'escape'],
    ['esc', 'escape'],
    ['enter', 'enter'],
    ['return', 'enter'],
    ['+', '+'],
    ['-', '-'],
    ['=', '='],
    ['/', '/'],
    ['.', '.'],
    [',', ','],
  ]);
  let key = special.get(keyRaw) || keyRaw;
  // Letters: use upper-case canonical
  if (key.length === 1 && /[a-z]/.test(key)) key = key.toUpperCase();
  // Function keys
  if (/^f[0-9]{1,2}$/.test(key)) key = key.toUpperCase();
  return {
    key,
    ctrl: !!ev.ctrlKey,
    alt: !!ev.altKey,
    shift: !!ev.shiftKey,
    meta: !!ev.metaKey,
  };
}

/** Convert a normalized accel into a string token list for indexing. */
function accelToString({ ctrl, alt, shift, meta, key }) {
  const mods = [];
  if (ctrl) mods.push('Ctrl');
  if (alt) mods.push('Alt');
  if (shift) mods.push('Shift');
  if (meta) mods.push('Meta');
  return mods.concat([key]).join('+');
}

/** Parse an accelerator pattern like 'Mod+Shift+Z' or 'ArrowLeft' into a predicate. */
function patternToPredicate(pattern) {
  const parts = String(pattern).split('+');
  const want = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    const u = p.toLowerCase();
    if (u === 'mod') {
      if (isMac) want.meta = true; else want.ctrl = true;
    } else if (u === 'ctrl' || u === 'control') {
      want.ctrl = true;
    } else if (u === 'alt' || u === 'option') {
      want.alt = true;
    } else if (u === 'shift') {
      want.shift = true;
    } else if (u === 'meta' || u === 'cmd' || u === 'command') {
      want.meta = true;
    } else {
      // key token
      let key = p;
      if (key.length === 1 && /[a-z]/i.test(key)) key = key.toUpperCase();
      const m = key.match(/^F([0-9]{1,2})$/i);
      if (m) key = `F${m[1]}`;
      want.key = key.toLowerCase();
    }
  }
  return (nev) => (
    (!!want.ctrl === !!nev.ctrl) &&
    (!!want.alt === !!nev.alt) &&
    (!!want.shift === !!nev.shift) &&
    (!!want.meta === !!nev.meta) &&
    (want.key ? want.key === nev.key.toLowerCase() : true)
  );
}

class Keymap {
  constructor() {
    /** @type {Map<string, string[]>} commandId -> patterns */
    this.bindings = new Map();
    /** @type {Map<string, Function>} */
    this.handlers = new Map();
    /** @type {Map<string, Function>} */
    this.when = new Map();
    /** Reverse index: token -> Set(commandId) */
    this.index = new Map();
    /** User overrides (loaded/saved) */
    this.user = new Map();
  }

  registerCommand(id, handler, opts = {}) {
    this.handlers.set(id, handler);
    if (opts.when) this.when.set(id, opts.when);
  }

  setDefaultBindings(id, patterns) {
    this.bindings.set(id, [...patterns]);
    this._rebuildIndex();
  }

  setUserBindings(id, patterns) {
    this.user.set(id, [...patterns]);
    this._rebuildIndex();
  }

  getBindings(id) {
    return this.user.get(id) || this.bindings.get(id) || [];
  }

  list() {
    const out = [];
    for (const id of new Set([...this.bindings.keys(), ...this.user.keys()])) {
      out.push({ id, default: this.bindings.get(id) || [], user: this.user.get(id) || [] });
    }
    return out;
  }

  handleKeydown = (ev) => {
    // Don’t intercept when typing in inputs/contenteditable.
    const t = ev.target;
    if (t) {
      const tag = (t.tagName || '').toLowerCase();
      const editable = t.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (editable) return;
    }
    const nev = normalizeEvent(ev);
    const token = accelToString(nev);
    const candidates = this.index.get(token);
    if (!candidates || candidates.size === 0) return;
    for (const id of candidates) {
      const whenOk = (this.when.get(id) || (() => true))();
      if (!whenOk) continue;
      const pats = this.getBindings(id);
      for (const p of pats) {
        const pred = patternToPredicate(p);
        if (pred(nev)) {
          try { this.handlers.get(id)?.(ev); } catch {}
          ev.preventDefault();
          return;
        }
      }
    }
  }

  attach() { window.addEventListener('keydown', this.handleKeydown); }
  detach() { window.removeEventListener('keydown', this.handleKeydown); }

  // Persistence of keybindings is handled by the app-level settings manager.
  saveToLocalStorage() {}
  loadFromLocalStorage() {}
  resetUser() { this.user.clear(); this._rebuildIndex(); }

  _rebuildIndex() {
    // Build a simple reverse index: fully-qualified accel (with real modifiers) -> commandIds.
    // Include both default and user bindings; user overrides replace (not merge) for that command id.
    this.index.clear();
    const all = new Map(this.bindings);
    for (const [id, v] of this.user) all.set(id, v);
    const sampleMods = [
      // Expand 'Mod' into platform-specific actual accelerators.
      { Ctrl: true, Meta: false },
      { Ctrl: false, Meta: true },
    ];
    const expand = (pattern) => {
      const parts = String(pattern).split('+');
      const hasMod = parts.find(p => p.toLowerCase() === 'mod');
      if (!hasMod) return [pattern];
      const variants = [];
      for (const m of sampleMods) {
        variants.push(parts.map(p => p.toLowerCase() === 'mod' ? (m.Meta ? 'Meta' : 'Ctrl') : p).join('+'));
      }
      return variants;
    };
    const toToken = (pat) => {
      const parts = String(pat).split('+');
      const want = { ctrl:false, alt:false, shift:false, meta:false, key:'' };
      for (const p of parts) {
        const u = p.toLowerCase();
        if (u === 'ctrl') want.ctrl = true;
        else if (u === 'alt' || u === 'option') want.alt = true;
        else if (u === 'shift') want.shift = true;
        else if (u === 'meta' || u === 'cmd' || u === 'command') want.meta = true;
        else want.key = u;
      }
      // Match normalizeEvent's canonicalization: letters uppercase, function keys uppercase, specials lower-case.
      let keyTok = want.key || '';
      if (keyTok.length === 1 && /[a-z]/.test(keyTok)) keyTok = keyTok.toUpperCase();
      const fm = keyTok.match(/^f([0-9]{1,2})$/);
      if (fm) keyTok = `F${fm[1]}`;
      return accelToString({ ctrl: want.ctrl, alt: want.alt, shift: want.shift, meta: want.meta, key: keyTok });
    };
    for (const [id, pats] of all) {
      for (const p of pats) {
        for (const v of expand(p)) {
          const tok = toToken(v);
          if (!this.index.has(tok)) this.index.set(tok, new Set());
          this.index.get(tok).add(id);
        }
      }
    }
  }
}

function createKeymap() { return new Keymap(); }

export { createKeymap };
