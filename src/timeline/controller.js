import {computeMaxScrollCSS} from './renderer.js';

export function setupTimelineUI({
  timelineEl,
  resizerEl,
  toggleEl,
  toggleGlobalEl,
  canvasEl,
  zoomInBtn,
  zoomOutBtn,
  zoomResetBtn,
  rootStyle,
  getCircuit,
  getCurrentLayer,
  renderWithState,
  onResizing, // optional: called during drag to allow external re-rendering (e.g., panels)
  onResized,  // optional: called after drag completes or width resets
}) {
  // Internal UI state persisted locally.
  let dragging = false;
  let startX = 0;
  let startW = 0;
  let timelineZoom = parseFloat(localStorage.getItem('timelineZoom') || '1');
  if (!(timelineZoom > 0)) timelineZoom = 1;
  const clampZoom = z => Math.min(3, Math.max(0.5, z));
  let timelineScrollY = parseFloat(localStorage.getItem('timelineScrollY') || '0');
  if (!(timelineScrollY >= 0)) timelineScrollY = 0;

  const savedCollapsed = localStorage.getItem('timelineCollapsed');
  if (savedCollapsed === '1') timelineEl.classList.add('collapsed');
  const savedWidth = localStorage.getItem('timelineWidth');
  if (savedWidth && !timelineEl.classList.contains('collapsed')) {
    rootStyle.setProperty('--timeline-width', savedWidth + 'px');
  }
  resizerEl.style.display = timelineEl.classList.contains('collapsed') ? 'none' : '';
  if (toggleGlobalEl) toggleGlobalEl.textContent = timelineEl.classList.contains('collapsed') ? 'Show timeline' : 'Hide timeline';
  if (toggleEl) toggleEl.textContent = timelineEl.classList.contains('collapsed') ? 'Show' : 'Hide';

  function render() {
    if (timelineEl.classList.contains('collapsed')) return;
    renderWithState({
      canvas: canvasEl,
      circuit: getCircuit(),
      currentLayer: getCurrentLayer(),
      timelineZoom,
      timelineScrollY,
    });
  }

  function setTimelineCollapsed(collapsed) {
    timelineEl.classList.toggle('collapsed', collapsed);
    localStorage.setItem('timelineCollapsed', collapsed ? '1' : '0');
    resizerEl.style.display = collapsed ? 'none' : '';
    if (toggleGlobalEl) toggleGlobalEl.textContent = collapsed ? 'Show timeline' : 'Hide timeline';
    if (toggleEl) toggleEl.textContent = collapsed ? 'Show' : 'Hide';
  }

  // Resizer
  resizerEl.addEventListener('mousedown', (e) => {
    if (timelineEl.classList.contains('collapsed')) return;
    dragging = true;
    startX = e.clientX;
    startW = timelineEl.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    timelineEl.classList.add('resizing');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const newW = Math.min(Math.max(startW - dx, 200), Math.max(260, Math.floor(window.innerWidth * 0.8)));
    rootStyle.setProperty('--timeline-width', newW + 'px');
    render();
    onResizing?.();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    timelineEl.classList.remove('resizing');
    const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-width'));
    if (!Number.isNaN(w)) localStorage.setItem('timelineWidth', String(w));
    onResized?.();
  });
  resizerEl.addEventListener('dblclick', () => {
    rootStyle.setProperty('--timeline-width', '360px');
    localStorage.setItem('timelineWidth', '360');
    render();
    onResized?.();
  });

  // Collapse toggles
  toggleEl?.addEventListener('click', () => setTimelineCollapsed(!timelineEl.classList.contains('collapsed')));
  toggleGlobalEl?.addEventListener('click', () => setTimelineCollapsed(!timelineEl.classList.contains('collapsed')));

  // Zoom controls
  function setZoom(z) {
    timelineZoom = clampZoom(z);
    localStorage.setItem('timelineZoom', String(timelineZoom));
    render();
  }
  zoomInBtn?.addEventListener('click', () => setZoom(timelineZoom * 1.25));
  zoomOutBtn?.addEventListener('click', () => setZoom(timelineZoom / 1.25));
  zoomResetBtn?.addEventListener('click', () => setZoom(1));

  // Scroll (wheel)
  canvasEl?.addEventListener('wheel', (e) => {
    const circuit = getCircuit();
    if (!circuit) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; // lines
    else if (e.deltaMode === 2) dy *= window.innerHeight; // pages
    const rectCssH = canvasEl.getBoundingClientRect().height;
    const maxScrollCss = computeMaxScrollCSS(circuit, rectCssH, timelineZoom, window.devicePixelRatio || 1);
    timelineScrollY = Math.max(0, Math.min(maxScrollCss, timelineScrollY + dy));
    localStorage.setItem('timelineScrollY', String(timelineScrollY));
    render();
  }, {passive: false});

  // Window events
  window.addEventListener('resize', render);

  return {
    render,
    setZoom,
    getZoom: () => timelineZoom,
    setScrollY: (y) => { timelineScrollY = Math.max(0, y|0); localStorage.setItem('timelineScrollY', String(timelineScrollY)); render(); },
    getScrollY: () => timelineScrollY,
    setCollapsed: setTimelineCollapsed,
  };
}
