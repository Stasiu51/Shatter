import { pickAndReadFile, downloadText } from '../io/import_export.js';

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k of Object.keys(attrs)) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) e.appendChild(c);
  return e;
}

export function setupSettingsUI(opts) {
  const {
    containerEl,
    importBtn,
    exportBtn,
    saveBtn,
    getSettings,
    onToggleFeature,
    onSaveKeybindings, // (allBindingsMap) => { id -> patterns[] }
    onImportSettings, // async
    onExportSettings, // returns object
    pushStatus = () => {},
  } = opts;

  let dirty = false;
  function setDirty(v) {
    dirty = !!v;
    if (saveBtn) {
      saveBtn.textContent = 'Save';
      saveBtn.style.backgroundColor = dirty ? '#28a745' : '';
      saveBtn.style.color = dirty ? 'white' : '';
    }
  }

  const FEATURE_LABELS = {
    terminalErrors: 'Include terminal errors',
  };

  function render() {
    const s = getSettings();
    if (!s || !containerEl) return;
    containerEl.textContent = '';
    setDirty(false);

    // Features section
    const featuresWrap = el('div', { class: 'settings-section' });
    featuresWrap.appendChild(el('h3', { text: 'Features' }));
    const ft = el('div');
    for (const name of Object.keys(s.features || {})) {
      const row = el('div', { class: 'settings-row' });
      const id = `feat-${name}`;
      const cb = el('input', { type: 'checkbox', id });
      cb.checked = !!s.features[name];
      cb.addEventListener('change', () => { try { onToggleFeature(name, cb.checked); } catch {} });
      const labText = FEATURE_LABELS[name] || name;
      const lab = el('label', { for: id, text: labText });
      row.appendChild(cb);
      row.appendChild(lab);
      ft.appendChild(row);
    }
    featuresWrap.appendChild(ft);

    // Keybindings section
    const keysWrap = el('div', { class: 'settings-section' });
    keysWrap.appendChild(el('h3', { text: 'Keybindings' }));
    const table = el('div', { class: 'settings-kb-table' });
    const cmds = s.keybindings?.commands || {};
    const ids = Object.keys(cmds).sort((a,b)=>{
      const na = (cmds[a]?.name||a).toLowerCase();
      const nb = (cmds[b]?.name||b).toLowerCase();
      return na.localeCompare(nb);
    });
    for (const id of ids) {
      const cmd = cmds[id] || {};
      const name = cmd.name || id;
      const bindingsTxt = Array.isArray(cmd.bindings) ? cmd.bindings.join(', ') : '';

      const row1 = el('div', { class: 'kb-row' });
      row1.appendChild(el('div', { class: 'kb-name', text: name }));
      table.appendChild(row1);
      const row2 = el('div', { class: 'kb-row' });
      const inp = el('input', { class: 'kb-input', type: 'text', placeholder: 'Comma-separated, e.g. Mod+Z, Shift+Mod+Z', value: bindingsTxt });
      inp.dataset.cmdId = id;
      inp.addEventListener('input', () => setDirty(true));
      row2.appendChild(inp);
      table.appendChild(row2);
    }
    keysWrap.appendChild(table);

    containerEl.appendChild(featuresWrap);
    containerEl.appendChild(keysWrap);
  }

  // Save all keybindings
  try {
    if (saveBtn) saveBtn.onclick = () => {
      const s = getSettings();
      if (!s) return;
      const inputs = containerEl.querySelectorAll('input.kb-input');
      let anyError = false;
      for (const i of inputs) i.style.borderColor = '';
      const updates = new Map();
      for (const i of inputs) {
        const id = i.dataset.cmdId;
        const name = s.keybindings?.commands?.[id]?.name || id;
        const raw = (i.value || '').trim();
        if (!raw) {
          i.style.borderColor = '#d1242f';
          pushStatus(`Keybinding ${name} empty`, 'error');
          anyError = true;
          continue;
        }
        const pats = raw.split(',').map(v => v.trim()).filter(Boolean);
        // Basic validation: require at least one non-mod token per pattern.
        const modSet = new Set(['mod','ctrl','control','alt','option','shift','meta','cmd','command']);
        const invalid = pats.some(p => {
          const parts = p.split('+').map(t=>t.trim().toLowerCase()).filter(Boolean);
          const hasKey = parts.some(t => !modSet.has(t));
          return !hasKey;
        });
        if (invalid) {
          i.style.borderColor = '#d1242f';
          pushStatus(`Keybinding ${name} invalid`, 'error');
          anyError = true;
          continue;
        }
        updates.set(id, pats);
      }
      if (anyError) return;
      try { onSaveKeybindings?.(updates); setDirty(false); pushStatus('Settings updated', 'info'); } catch {}
    };
  } catch {}

  // Wire import/export
  try {
    if (exportBtn) exportBtn.onclick = () => {
      try {
        const obj = onExportSettings?.() || {};
        const text = JSON.stringify(obj, null, 2);
        downloadText('settings_user.json', text);
        pushStatus('Exported settings_user.json', 'info');
      } catch {}
    };
  } catch {}

  try {
    if (importBtn) importBtn.onclick = async () => {
      const picked = await pickAndReadFile({ accept: '.json' });
      if (!picked || !picked.text) return;
      try {
        const parsed = JSON.parse(picked.text);
        await onImportSettings?.(parsed);
        render();
        pushStatus('Imported settings', 'info');
      } catch (e) {
        pushStatus(`Import failed: ${e?.message || e}`, 'error');
      }
    };
  } catch {}

  render();
  return { render };
}
