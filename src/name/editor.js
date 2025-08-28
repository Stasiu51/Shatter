export function setupNameEditor(el, initialName, {onCommit} = {}) {
  let currentName = sanitizeName(initialName || 'circuit');
  function setDisplay(name) {
    el.textContent = currentName = sanitizeName(name);
  }
  setDisplay(currentName);

  function commit() {
    if (!el.isContentEditable) return;
    const next = sanitizeName(el.textContent);
    setDisplay(next);
    el.contentEditable = 'false';
    el.classList.remove('editing');
    onCommit?.(currentName);
  }

  el.addEventListener('click', () => {
    el.contentEditable = 'true';
    el.classList.add('editing');
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); setDisplay(currentName); commit(); }
  });
  el.addEventListener('blur', commit);

  return {
    setName: (n) => setDisplay(n),
    getName: () => currentName,
  };
}

export function sanitizeName(name) {
  let n = String(name || '').trim();
  n = n.replace(/\.(stim|txt)$/i, '');
  n = n.replace(/[\\/:*?"<>|]/g, '').trim();
  if (!n) n = 'circuit';
  return n;
}

