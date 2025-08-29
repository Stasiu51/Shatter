import { PanelManager } from './shatter/panel_manager.js';
import { parseStim, stringifyStim, pickAndReadFile, downloadText } from './io/import_export.js';
import { parseOverlayFromStim } from './overlay.js';
import { renderTimeline as renderTimelineCore, computeMaxScrollCSS } from './timeline/renderer.js';
import { renderPanel as renderCrumblePanel } from './panels/crumble_panel_renderer.js';
import { setupTimelineUI } from './timeline/controller.js';
import { createStatusLogger } from './status/logger.js';
import { setupNameEditor, sanitizeName } from './name/editor.js';
import { setupLayerKeyboard } from './layers/keyboard.js';
import { createSheetsDropdown } from './panels/sheets_dropdown.js';

const panelsEl = document.getElementById('panels');
const mgr = new PanelManager(panelsEl);

const seg = document.getElementById('layout-seg');
seg?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-layout]');
  if (!btn) return;
  for (const b of seg.querySelectorAll('button')) b.classList.remove('active');
  btn.classList.add('active');
  mgr.setLayout(btn.dataset.layout);
  schedulePanelsRender();
  ensurePanelSheets();
  renderPanelSheetsAll();
});

// Timeline sizing & collapse
const timeline = document.getElementById('timeline');
const resizer = document.getElementById('timeline-resizer');
const toggle = document.getElementById('timeline-toggle');
const toggleGlobal = document.getElementById('timeline-toggle-global');
const timelineCanvas = document.getElementById('timeline-canvas');
const zoomInBtn = document.getElementById('timeline-zoom-in');
const zoomOutBtn = document.getElementById('timeline-zoom-out');
const zoomResetBtn = document.getElementById('timeline-zoom-reset');
const panelsZoomInBtn = document.getElementById('panels-zoom-in');
const panelsZoomOutBtn = document.getElementById('panels-zoom-out');
const panelsZoomResetBtn = document.getElementById('panels-zoom-reset');
const nameEl = document.getElementById('circuit-name');
const statusEl = document.getElementById('statusbar');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const statusRight = document.getElementById('status-right');
const statusTextRight = document.getElementById('status-text-right');
const statusDotRight = document.getElementById('status-dot-right');
const btnImport = document.getElementById('btn-import');
const btnExport = document.getElementById('btn-export');

const rootStyle = document.documentElement.style;

/** Clamp number into [lo, hi]. */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** LocalStorage keys. */
const LS_KEYS = {
  circuitName: 'circuitName',
  panelZoom: 'panelZoom',
  timelineScrollY: 'timelineScrollY',
};

/** Default overlay sheet when none are present. */
const DEFAULT_SHEETS = [{ name: 'DEFAULT', z: 0 }];

/** Current circuit (parsed) */
let currentCircuit = null;
let currentLayer = 0;

let currentName = localStorage.getItem(LS_KEYS.circuitName) || 'circuit';
let panelZoom = Number.parseFloat(localStorage.getItem(LS_KEYS.panelZoom) || '1');
if (!Number.isFinite(panelZoom) || panelZoom <= 0) panelZoom = 1;

const nameCtl = setupNameEditor(nameEl, currentName, {
  onCommit: (n) => {
    currentName = n;
    localStorage.setItem(LS_KEYS.circuitName, n);
  },
});

// Overlay state (Milestone 4)
const overlayState = {
  /** @type {Array<{name:string,z:number}>} */
  sheets: [],
  /** @type {Array<any>} */
  diagnostics: [],
  /** @type {Array<Set<string>>} */
  panelSheets: [],
};

/** Return sheets or a default singleton. */
const getSheetsSafe = () => (overlayState.sheets?.length ? overlayState.sheets : DEFAULT_SHEETS);

/** Ensure per-panel sheet selections exist and match current layout count. */
function ensurePanelSheets() {
  const panelCount = mgr.layout | 0;
  const names = getSheetsSafe().map((l) => l.name);

  while (overlayState.panelSheets.length < panelCount) {
    overlayState.panelSheets.push(new Set(names));
  }
  if (overlayState.panelSheets.length > panelCount) {
    overlayState.panelSheets.length = panelCount;
  }
}

// Initialize per-panel sheets UI immediately so the initial layout is correct
ensurePanelSheets();
requestAnimationFrame(() => {
  renderPanelSheetsAll();
});

// Timeline UI setup and rendering glue
const timelineCtl = setupTimelineUI({
  timelineEl: timeline,
  resizerEl: resizer,
  toggleEl: toggle,
  toggleGlobalEl: toggleGlobal,
  canvasEl: timelineCanvas,
  zoomInBtn,
  zoomOutBtn,
  zoomResetBtn,
  rootStyle,
  getCircuit: () => currentCircuit,
  getCurrentLayer: () => currentLayer,
  renderWithState: ({ canvas, circuit, currentLayer: curLayer, timelineZoom, timelineScrollY }) => {
    if (!circuit) return;
    const rectCssH = canvas.getBoundingClientRect().height;
    const maxScrollCss = computeMaxScrollCSS(
      circuit,
      rectCssH,
      timelineZoom,
      window.devicePixelRatio || 1
    );
    if (timelineScrollY > maxScrollCss) {
      timelineScrollY = maxScrollCss;
      localStorage.setItem(LS_KEYS.timelineScrollY, String(timelineScrollY));
    }
    renderTimelineCore({ canvas, circuit, currentLayer: curLayer, timelineZoom, timelineScrollY });
    updateLayerIndicator();
  },
  onResizing: () => {
    renderAllPanels();
  },
  onResized: () => {
    renderAllPanels();
  },
});

/** Build inline per-panel sheet toggles inside each panel header. */
function renderPanelSheetsAll() {
  if (!mgr?.panels?.length) return;
  const sheets = getSheetsSafe();

  for (let i = 0; i < mgr.panels.length; i++) {
    const p = mgr.panels[i];
    if (!p?.header) continue;

    let dd = p.sheetsDropdown;
    if (!dd) {
      dd = createSheetsDropdown({
        getSheets: getSheetsSafe,
        getSelected: () => {
          ensurePanelSheets();
          if (!overlayState.panelSheets[i]) {
            overlayState.panelSheets[i] = new Set(sheets.map((l) => l.name));
          }
          return overlayState.panelSheets[i];
        },
        onChange: (newSet) => {
          ensurePanelSheets();
          overlayState.panelSheets[i] = newSet;
          schedulePanelsRender();
        },
      });

      // Anchor dropdown on the left side of header
      if (p.headerLeft) {
        p.headerLeft.appendChild(dd.el);
      } else {
        p.header.insertBefore(dd.el, p.header.firstChild);
      }
      dd.el.style.marginLeft = '0';
      p.sheetsDropdown = dd;
    }
    dd.render();
  }
}

// Import/Export handlers
btnImport?.addEventListener('click', async () => {
  const picked = await pickAndReadFile({ accept: '.stim,.txt' });
  if (!picked) return;
  try {
    const { circuit, text, warnings } = parseStim(picked.text);
    currentCircuit = circuit;
    currentLayer = 0;

    // Rebuild panels to ensure fresh canvases (avoid stale placeholders).
    mgr.build();
    timelineCtl.setScrollY(0);
    timelineCtl.render();
    renderAllPanels();

    if (picked.name) {
      const nn = sanitizeName(picked.name);
      nameCtl.setName(nn);
      currentName = nn;
      localStorage.setItem(LS_KEYS.circuitName, currentName);
    }

    pushStatus(`Imported "${currentName}" (${(picked.text || '').length} chars).`, 'info');

    if (warnings?.length) {
      for (const w of warnings) pushStatus(w, 'warning');
      pushStatus(`Import produced ${warnings.length} warning(s).`, 'info');
    }

    try {
      const overlay = parseOverlayFromStim(picked.text || '');
      overlayState.sheets = overlay.sheets || [];
      overlayState.diagnostics = overlay.diagnostics || [];
      ensurePanelSheets();
      renderPanelSheetsAll();

      if (overlayState.diagnostics?.length) {
        for (const d of overlayState.diagnostics) {
          const sev = d.severity === 'error' ? 'error' : 'warning';
          pushStatus(`[${d.code}] line ${d.line}: ${d.message}`, sev);
        }
        pushStatus(`Overlay produced ${overlayState.diagnostics.length} issue(s).`, 'info');
      }
    } catch (e) {
      pushStatus(`Overlay parse error: ${e?.message || e}`, 'error');
    }
  } catch (e) {
    // On error, there's no circuit to render. Leave previous view.
    pushStatus(`Parse error while importing: ${e?.message || e}`, 'error');
  }
});

btnExport?.addEventListener('click', () => {
  const text = stringifyStim(currentCircuit) || '';
  const fname = (currentName || 'circuit') + '.stim';
  downloadText(fname, text);
  pushStatus(`Exported "${currentName}.stim" (${text.length} chars).`, 'info');
});

// Status logger
const { pushStatus } = createStatusLogger({
  statusBarEl: statusEl,
  statusTextEl: statusText,
  statusDotEl: statusDot,
  statusRightEl: statusRight,
  statusTextRightEl: statusTextRight,
  statusDotRightEl: statusDotRight,
  nameProvider: () => currentName,
});
pushStatus('Ready.', 'info');

/** Update timeline layer indicator text. */
function updateLayerIndicator() {
  const el = document.getElementById('timeline-layer-info');
  if (!el) return;
  if (!currentCircuit) {
    el.textContent = '';
    return;
  }
  const last = Math.max(0, currentCircuit.layers.length - 1);
  el.textContent = `Layer ${currentLayer}/${last}. Use Q/E to move.`;
}

function setLayer(layer) {
  if (!currentCircuit) return;
  const maxLayer = Math.max(0, currentCircuit.layers.length - 1);
  const next = clamp(Math.trunc(layer), 0, maxLayer);
  if (next === currentLayer) return;
  currentLayer = next;
  timelineCtl.render();
  updateLayerIndicator();
  schedulePanelsRender();
}

// Layer keyboard handling
setupLayerKeyboard({
  isEditing: () => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return true;
    if (el.isContentEditable) return true;
    return false;
  },
  getLayer: () => currentLayer,
  setLayer,
  getMaxLayer: () => Math.max(0, (currentCircuit?.layers?.length || 1) - 1),
});

/** Ensure a panel has a canvas element and return it. */
function ensurePanelCanvas(p) {
  if (p.canvas) return p.canvas;
  const existing = p.body?.querySelector?.('canvas');
  if (existing) return (p.canvas = existing);
  if (p.body) {
    const cv = document.createElement('canvas');
    cv.style.width = '100%';
    cv.style.height = '100%';
    p.body.innerHTML = '';
    p.body.appendChild(cv);
    p.canvas = cv;
    return cv;
  }
  return null;
}

/** Render all panels. */
function renderAllPanels() {
  if (!currentCircuit) return;
  for (const p of mgr.panels) {
    const cv = ensurePanelCanvas(p);
    if (!cv) continue;
    // Measure for correctness; renderer may rely on CSS size for DPI/layout.
    cv.getBoundingClientRect();
    renderCrumblePanel({ canvas: cv, circuit: currentCircuit, currentLayer, panelZoom });
  }
}

let panelsRenderScheduled = false;
function schedulePanelsRender() {
  if (panelsRenderScheduled) return;
  panelsRenderScheduled = true;
  requestAnimationFrame(() => {
    panelsRenderScheduled = false;
    renderAllPanels();
  });
}

window.addEventListener('resize', () => {
  schedulePanelsRender();
});

function setPanelZoom(z) {
  panelZoom = clamp(z, 0.5, 3);
  localStorage.setItem(LS_KEYS.panelZoom, String(panelZoom));
  schedulePanelsRender();
}

panelsZoomInBtn?.addEventListener('click', () => setPanelZoom(panelZoom * 1.25));
panelsZoomOutBtn?.addEventListener('click', () => setPanelZoom(panelZoom / 1.25));
panelsZoomResetBtn?.addEventListener('click', () => setPanelZoom(1));
