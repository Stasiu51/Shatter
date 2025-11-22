export function setupMarkersUI({
  markersEl,
  toggleGlobalEl,
  toggleLocalEl,
  onToggle, // optional callback after toggling collapsed state
}) {
  const LS_KEY = 'toolboxCollapsed';
  const collapsed = localStorage.getItem(LS_KEY) === '1';
  if (collapsed) markersEl.classList.add('collapsed');

  const updateToggleText = (c) => {
    if (toggleGlobalEl) toggleGlobalEl.textContent = c ? 'Show toolbox' : 'Hide toolbox';
    if (toggleLocalEl) toggleLocalEl.textContent = c ? 'Show' : 'Hide';
  };
  updateToggleText(collapsed);

  const setCollapsed = (c) => {
    markersEl.classList.toggle('collapsed', c);
    localStorage.setItem(LS_KEY, c ? '1' : '0');
    updateToggleText(c);
    onToggle?.(c);
  };

  toggleGlobalEl?.addEventListener('click', () => setCollapsed(!markersEl.classList.contains('collapsed')));
  toggleLocalEl?.addEventListener('click', () => setCollapsed(!markersEl.classList.contains('collapsed')));

  return { setCollapsed, getCollapsed: () => markersEl.classList.contains('collapsed') };
}
