// Settings loader: merges settings_default.json with per‑user overrides from
// localStorage. Precedence: defaults < localStorage (user has last word).
// We intentionally avoid fetching an additional settings_user.json so that all
// user customization is a single source of truth and easily exportable/importable.

const DEFAULT_URL = 'settings_default.json';
const LS_KEY = 'settings_user.v1';

const deepClone = (x) => JSON.parse(JSON.stringify(x));

function deepMerge(base, overlay) {
  if (!overlay) return base;
  const out = deepClone(base);
  const stack = [[out, overlay]];
  while (stack.length) {
    const [dst, src] = stack.pop();
    for (const k of Object.keys(src || {})) {
      const sv = src[k];
      const dv = dst[k];
      if (sv && typeof sv === 'object' && !Array.isArray(sv) && dv && typeof dv === 'object' && !Array.isArray(dv)) {
        stack.push([dv, sv]);
      } else {
        dst[k] = deepClone(sv);
      }
    }
  }
  return out;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch {
    return undefined;
  }
}

function loadUserFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function saveUserToLocalStorage(json) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(json || {}));
  } catch {}
}

// Load settings in order: default → localStorage (user has last word). Seed localStorage on first run.
async function loadSettings() {
  const def = (await fetchJson(DEFAULT_URL)) || { features: {}, keybindings: { commands: {} } };
  let ls = loadUserFromLocalStorage();
  if (!ls || typeof ls !== 'object') {
    ls = deepClone(def);
    saveUserToLocalStorage(ls);
  } else {
    // Ensure any newly added default keys are present in the local user copy.
    ls = deepMerge(def, ls);
    saveUserToLocalStorage(ls);
  }
  const final = ls;
  final.features = final.features || {};
  final.keybindings = final.keybindings || { commands: {} };
  final.keybindings.commands = final.keybindings.commands || {};
  // Strip internal-only flags that shouldn't show in UI (e.g., legacy reload_on_change)
  if (final.features && Object.prototype.hasOwnProperty.call(final.features, 'reload_on_change')) {
    delete final.features.reload_on_change;
    saveUserToLocalStorage(final);
  }
  return final;
}

function saveUserSettings(settings) { saveUserToLocalStorage(settings || {}); }

export { loadSettings, saveUserSettings };

// Optional helpers for future UI import/export flows
export function exportUserSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function importUserSettings(obj) {
  try {
    const parsed = typeof obj === 'string' ? JSON.parse(obj) : obj;
    saveUserToLocalStorage(parsed || {});
  } catch {}
}
