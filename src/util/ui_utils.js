// Small UI helpers shared by controllers (timeline, editor)
// Minimal, dependency‑free, plain ESM.

/**
 * Sets up a left-edge resizer and collapse toggles for a right-hand side pane.
 * - Persists width and collapsed state in localStorage.
 * - Uses a CSS custom property to drive width (e.g. --timeline-width).
 * - Assumes the resizer is to the immediate left of the pane.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.paneEl - The pane element to size/collapse.
 * @param {HTMLElement} opts.resizerEl - The vertical resizer handle (left of pane).
 * @param {CSSStyleDeclaration} opts.rootStyle - document.documentElement.style
 * @param {string} opts.cssVar - CSS variable name, e.g. '--timeline-width'.
 * @param {string} opts.lsWidthKey - localStorage key for width.
 * @param {string} opts.lsCollapsedKey - localStorage key for collapsed state.
 * @param {number} [opts.defaultWidthPx=360] - Default width when resetting/dblclick.
 * @param {number} [opts.minWidthPx=200] - Minimum width clamp. Overridden by paneEl.dataset.minWidth if present.
 * @param {HTMLElement[]} [opts.toggleEls] - Elements that toggle collapsed state on click.
 * @param {function(boolean):void} [opts.onCollapsedChanged] - Called when collapsed changes.
 * @param {function():void} [opts.onResizing] - Called during drag to allow external re-rendering.
 * @param {function():void} [opts.onResized] - Called after drag completes or width resets.
 * @param {function(boolean):void} [opts.updateToggleText] - Optional label updater given collapsed.
 */
export function setupResizablePane(opts) {
  const {
    paneEl,
    resizerEl,
    rootStyle,
    cssVar,
    lsWidthKey,
    lsCollapsedKey,
    defaultWidthPx = 360,
    minWidthPx = 200,
    defaultCollapsed = false,
    toggleEls = [],
    onCollapsedChanged,
    onResizing,
    onResized,
    updateToggleText,
  } = opts;

  let dragging = false;
  let startX = 0;
  let startW = 0;

  // Initial collapsed/width
  const savedCollapsed = localStorage.getItem(lsCollapsedKey);
  let startCollapsed = false;
  if (savedCollapsed === '1') startCollapsed = true;
  else if (savedCollapsed === null || savedCollapsed === undefined) startCollapsed = !!defaultCollapsed;
  if (startCollapsed) paneEl.classList.add('collapsed');
  const savedWidth = localStorage.getItem(lsWidthKey);
  if (savedWidth) {
    // Apply saved width even when collapsed so un-collapsing uses a sane value.
    rootStyle.setProperty(cssVar, savedWidth + 'px');
  }
  resizerEl.style.display = paneEl.classList.contains('collapsed') ? 'none' : '';
  updateToggleText?.(paneEl.classList.contains('collapsed'));

  // Helper: determine desired minimum width from data-min-width or option.
  const getMinW = () => {
    let minW = minWidthPx;
    try {
      const attr = paneEl?.dataset?.minWidth;
      const parsed = attr ? parseInt(attr, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) minW = parsed;
    } catch {}
    return Math.max(100, minW);
  };

  // Ensure CSS var width is at least the minimum when starting uncollapsed.
  const ensureAtLeastMinWidth = () => {
    const minW = getMinW();
    let cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
    if (!Number.isFinite(cur) || cur <= 0) cur = defaultWidthPx;
    if (cur < minW) {
      rootStyle.setProperty(cssVar, String(Math.max(minW, defaultWidthPx)) + 'px');
    }
  };
  if (!paneEl.classList.contains('collapsed')) ensureAtLeastMinWidth();

  function setCollapsed(collapsed) {
    paneEl.classList.toggle('collapsed', collapsed);
    localStorage.setItem(lsCollapsedKey, collapsed ? '1' : '0');
    resizerEl.style.display = collapsed ? 'none' : '';
    updateToggleText?.(collapsed);
    // When un-collapsing, snap width up to at least the minimum to avoid jumpy headers.
    if (!collapsed) ensureAtLeastMinWidth();
    onCollapsedChanged?.(collapsed);
  }

  // Toggle handlers
  for (const t of toggleEls) t?.addEventListener('click', () => setCollapsed(!paneEl.classList.contains('collapsed')));

  // Resizer drag (resizer is left of pane)
  resizerEl.addEventListener('mousedown', (e) => {
    if (paneEl.classList.contains('collapsed')) return;
    dragging = true;
    startX = e.clientX;
    startW = paneEl.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    paneEl.classList.add('resizing');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    // Move right shrinks the pane; move left grows the pane.
    // Determine minimum width: prefer explicit data-min-width on the pane, then opts.minWidthPx, then fallback 200.
    let minW = minWidthPx;
    try {
      const attr = paneEl?.dataset?.minWidth;
      const parsed = attr ? parseInt(attr, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) minW = parsed;
    } catch {}
    const newW = Math.min(Math.max(startW - dx, Math.max(100, minW)), Math.max(260, Math.floor(window.innerWidth * 0.8)));
    rootStyle.setProperty(cssVar, newW + 'px');
    onResizing?.();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    paneEl.classList.remove('resizing');
    const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
    if (!Number.isNaN(w)) localStorage.setItem(lsWidthKey, String(w));
    onResized?.();
  });
  resizerEl.addEventListener('dblclick', () => {
    rootStyle.setProperty(cssVar, defaultWidthPx + 'px');
    localStorage.setItem(lsWidthKey, String(defaultWidthPx));
    onResized?.();
  });

  return {
    setCollapsed,
    getCollapsed: () => paneEl.classList.contains('collapsed'),
    setWidthPx: (w) => {
      const ww = Math.max(200, Math.floor(w));
      rootStyle.setProperty(cssVar, ww + 'px');
      localStorage.setItem(lsWidthKey, String(ww));
      onResized?.();
    },
    getWidthPx: () => parseInt(getComputedStyle(document.documentElement).getPropertyValue(cssVar)),
  };
}
