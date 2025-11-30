/**
 * Creates a compact dropdown UI to select visible sheets for a panel.
 * Usage:
 *   const dd = createSheetsDropdown({
 *     getLayers: () => [{name, z}, ...],
 *     getSelected: () => new Set([...]),
 *     onChange: (newSet) => { // update state }
 *   });
 *   headerEl.appendChild(dd.el);
 *   dd.render();
 */
export function createSheetsDropdown({ getSheets, getSelected, onChange }) {
  const root = document.createElement('div');
  root.className = 'sheets-dd';
  root.style.position = 'relative';
  root.style.right = '0px';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sheets-dd-button';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.gap = '6px';
  button.style.padding = '4px 8px';
  button.style.border = '1px solid var(--border)';
  button.style.borderRadius = '6px';
  button.style.background = 'var(--sheets-dd-bg, #fff)';
  button.style.color = 'var(--sheets-dd-fg, var(--text))';
  button.style.font = 'inherit';
  button.style.fontSize = '10px';
  button.style.cursor = 'pointer';

  const label = document.createElement('span');
  label.textContent = 'Sheets:';
  label.style.color = 'var(--sheets-dd-label, #57606a)';
  label.style.fontSize = '10px';

  const text = document.createElement('span');
  text.className = 'sheets-dd-text';
  text.style.maxWidth = '220px';
  text.style.whiteSpace = 'nowrap';
  text.style.overflow = 'hidden';
  text.style.textOverflow = 'ellipsis';
  text.style.color = 'var(--sheets-dd-fg, var(--text))';
  text.style.fontSize = '10px';

  const caret = document.createElement('span');
  caret.textContent = '▼';
  caret.style.fontSize = '10px';
  caret.style.opacity = '0.8';

  button.append(label, text, caret);
  root.appendChild(button);

  const menu = document.createElement('div');
  menu.className = 'sheets-dd-menu';
  menu.style.position = 'absolute';
  menu.style.top = 'calc(100% + 4px)';
  // Default anchor: align to left edge of the button
  menu.style.left = '0';
  menu.style.minWidth = '200px';
  menu.style.maxWidth = '280px';
  menu.style.maxHeight = '240px';
  menu.style.overflow = 'auto';
  menu.style.border = '1px solid var(--border)';
  menu.style.borderRadius = '8px';
  menu.style.background = 'var(--sheets-dd-menu-bg, var(--sheets-dd-bg, #fff))';
  menu.style.boxShadow = '0 8px 24px rgba(140,149,159,0.2)';
  menu.style.padding = '8px';
  menu.style.zIndex = '50';
  menu.style.display = 'none';
  menu.style.fontSize = '10px';
  menu.style.color = 'var(--sheets-dd-fg, #24292f)';
  root.appendChild(menu);

  function formatSelected(names, sel) {
    const chosen = names.filter(n => sel.has(n));
    if (chosen.length === 0) return 'None';
    if (chosen.length <= 3) return chosen.join(', ');
    return `${chosen.slice(0, 3).join(', ')} +${chosen.length - 3}`;
  }

  function closeMenu() { menu.style.display = 'none'; document.removeEventListener('click', onDocClick, true); }
  function openMenu() {
    menu.style.display = 'block';
    // Position within viewport: flip to right-align if overflowing right
    try {
      const btnRect = button.getBoundingClientRect();
      // Temporarily set left-anchored for measurement
      menu.style.left = '0';
      menu.style.right = '';
      const menuRect = menu.getBoundingClientRect();
      const viewportW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const margin = 8;
      const overflowRight = btnRect.left + menuRect.width + margin > viewportW;
      if (overflowRight) {
        // Align menu's right edge to the button's right edge
        menu.style.left = '';
        menu.style.right = '0';
      }
      // Constrain width to viewport
      const maxW = Math.min(280, Math.max(180, viewportW - 2 * margin));
      menu.style.maxWidth = maxW + 'px';
    } catch {}
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }
  function toggleMenu() { if (menu.style.display === 'none') openMenu(); else closeMenu(); }
  function onDocClick(e) { if (!root.contains(e.target)) closeMenu(); }

  function renderMenu() {
    const layers = (getSheets() || []).map(l => l.name);
    const sel = new Set(getSelected() || []);
    menu.innerHTML = '';

    // Actions row
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'space-between';
    actions.style.gap = '8px';
    actions.style.marginBottom = '6px';
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    const noneBtn = document.createElement('button');
    noneBtn.textContent = 'None';
    for (const b of [allBtn, noneBtn]) {
      b.type = 'button';
      b.style.font = 'inherit';
      b.style.fontSize = '10px';
      b.style.padding = '4px 8px';
      b.style.border = '1px solid var(--border)';
      b.style.borderRadius = '6px';
      b.style.background = 'var(--sheets-dd-bg, #fff)';
      b.style.color = 'var(--sheets-dd-fg, #24292f)';
      b.style.cursor = 'pointer';
    }
    allBtn.addEventListener('click', () => {
      const newSel = new Set(layers);
      onChange(newSel);
      renderButton();
      renderMenu();
    });
    noneBtn.addEventListener('click', () => {
      const newSel = new Set();
      onChange(newSel);
      renderButton();
      renderMenu();
    });
    actions.append(allBtn, noneBtn);
    menu.appendChild(actions);

    // List of layers with checkboxes
    for (const name of layers) {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '4px 2px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sel.has(name);
      cb.addEventListener('change', () => {
        const newSel = new Set(getSelected() || []);
        if (cb.checked) newSel.add(name); else newSel.delete(name);
        onChange(newSel);
        renderButton();
      });
      const span = document.createElement('span');
      span.textContent = name;
      row.append(cb, span);
      menu.appendChild(row);
    }
  }

  function renderButton() {
    const names = (getSheets() || []).map(l => l.name);
    const sel = new Set(getSelected() || []);
    text.textContent = formatSelected(names, sel);
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.style.display === 'none') {
      renderMenu();
    }
    toggleMenu();
  });

  function render() {
    renderButton();
    if (menu.style.display !== 'none') renderMenu();
  }

  return { el: root, render, close: closeMenu };
}
