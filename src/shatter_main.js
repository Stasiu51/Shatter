import {PanelManager} from './shatter/panel_manager.js';
import {parseStim, stringifyStim, pickAndReadFile, downloadText} from './io/import_export.js';
import {parseOverlayFromStim} from './overlay.js';
import {renderTimeline as renderTimelineCore, computeMaxScrollCSS} from './timeline/renderer.js';
import {renderPanel as renderCrumblePanel} from './panels/crumble_panel_renderer.js';
import {setupTimelineUI} from './timeline/controller.js';
import {createStatusLogger} from './status/logger.js';
import {setupNameEditor, sanitizeName} from './name/editor.js';
import {setupLayerKeyboard} from './layers/keyboard.js';
import {createSheetsDropdown} from './panels/sheets_dropdown.js';

const panelsEl = document.getElementById('panels');
const mgr = new PanelManager(panelsEl);

const seg = document.getElementById('layout-seg');
seg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-layout]');
  if (!btn) return;
  for (const b of seg.querySelectorAll('button')) b.classList.remove('active');
  btn.classList.add('active');
  mgr.setLayout(btn.dataset.layout);
  schedulePanelsRender();
  // Rebuild per-panel sheets UI for new panel count
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
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Current circuit (parsed)
let currentCircuit = null;
let currentLayer = 0;
let currentName = localStorage.getItem('circuitName') || 'circuit';
let panelZoom = parseFloat(localStorage.getItem('panelZoom') || '1');
if (!(panelZoom > 0)) panelZoom = 1;
const nameCtl = setupNameEditor(nameEl, currentName, {
  onCommit: (n) => { currentName = n; localStorage.setItem('circuitName', currentName); }
});

// name editor handled by name/editor.js

// Overlay state (Milestone 4)
let overlayState = {
  layers: /** @type {Array<{name:string,z:number}>} */ ([]),
  diagnostics: /** @type {Array<any>} */ ([]),
  panelSheets: /** @type {Array<Set<string>>} */ ([]),
};

function ensurePanelSheets() {
  const panelCount = mgr.layout|0;
  const names = (overlayState.layers.length ? overlayState.layers : [{name:'DEFAULT', z:0}]).map(l => l.name);
  while (overlayState.panelSheets.length < panelCount) {
    overlayState.panelSheets.push(new Set(names));
  }
  if (overlayState.panelSheets.length > panelCount) overlayState.panelSheets.length = panelCount;
}

// Initialize per-panel sheets UI immediately so the initial layout is correct
// (use a DEFAULT layer until a circuit is loaded and layers are parsed).
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
  renderWithState: ({canvas, circuit, currentLayer, timelineZoom, timelineScrollY}) => {
    if (!circuit) return;
    const rectCssH = canvas.getBoundingClientRect().height;
    const maxScrollCss = computeMaxScrollCSS(circuit, rectCssH, timelineZoom, window.devicePixelRatio || 1);
    if (timelineScrollY > maxScrollCss) {
      timelineScrollY = maxScrollCss;
      localStorage.setItem('timelineScrollY', String(timelineScrollY));
    }
    renderTimelineCore({canvas, circuit, currentLayer, timelineZoom, timelineScrollY});
    updateLayerIndicator();
  },
  onResizing: () => { renderAllPanels(); },
  onResized: () => { renderAllPanels(); },
});

// Build inline per-panel sheet toggles inside each panel header
function renderPanelSheetsAll() {
  if (!mgr?.panels?.length) return;
  const layers = overlayState.layers?.length ? overlayState.layers : [{name: 'DEFAULT', z: 0}];
  for (let i = 0; i < mgr.panels.length; i++) {
    const p = mgr.panels[i];
    if (!p?.header) continue;
    // Clean up any legacy sheet controls appended directly to header
    for (const old of Array.from(p.header.querySelectorAll('.panel-sheets, .sheets-dd'))) {
      old.remove();
    }
    // Remove any legacy title left around by older builds
    for (const t of Array.from(p.header.querySelectorAll('.panel-title'))) {
      t.remove();
    }
    // Ensure dropdown once
    let dd = p.sheetsDropdown;
    if (!dd) {
      dd = createSheetsDropdown({
        getLayers: () => (overlayState.layers?.length ? overlayState.layers : [{name: 'DEFAULT', z: 0}]),
        getSelected: () => overlayState.panelSheets[i] || new Set(layers.map(l => l.name)),
        onChange: (newSet) => {
          ensurePanelSheets();
          overlayState.panelSheets[i] = newSet;
          schedulePanelsRender();
        },
      });
      // Anchor dropdown on the left side of header
      if (p.headerLeft) p.headerLeft.appendChild(dd.el); else p.header.insertBefore(dd.el, p.header.firstChild);
      // Ensure left-anchored styling
      try { dd.el.style.marginLeft = '0'; } catch {}
      p.sheetsDropdown = dd;
    }
    dd.render();
  }
}

// Import/Export handlers
btnImport?.addEventListener('click', async () => {
  const picked = await pickAndReadFile({accept: '.stim,.txt'});
  if (!picked) return;
  try {
    const {circuit, text, warnings} = parseStim(picked.text);
    currentCircuit = circuit;
    currentLayer = 0;
    // Rebuild panels to ensure fresh canvases (avoid stale placeholders).
    mgr.build();
    timelineCtl.setScrollY(0);
    timelineCtl.render();
    renderAllPanels();
    updateLayerIndicator();
    if (picked.name) { const nn = sanitizeName(picked.name); nameCtl.setName(nn); currentName = nn; localStorage.setItem('circuitName', currentName); }
    pushStatus(`Imported "${currentName}" (${(picked.text||'').length} chars).`, 'info');
    if (warnings?.length) {
      for (const w of warnings) pushStatus(w, 'warning');
      pushStatus(`Import produced ${warnings.length} warning(s).`, 'info');
    }
    try {
      const overlay = parseOverlayFromStim(picked.text || "");
      overlayState.layers = overlay.layers || [];
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
const {pushStatus} = createStatusLogger({
  statusBarEl: statusEl,
  statusTextEl: statusText,
  statusDotEl: statusDot,
  statusRightEl: statusRight,
  statusTextRightEl: statusTextRight,
  statusDotRightEl: statusDotRight,
  nameProvider: () => currentName,
});
pushStatus('Ready.', 'info');

// Timeline rendering is handled by timeline/controller + timeline/renderer

// Layer stepping (Q/E), Shift for ±5
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
  const clamped = Math.max(0, Math.min(maxLayer, layer|0));
  if (clamped === currentLayer) return;
  currentLayer = clamped;
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

function renderAllPanels() {
  if (!currentCircuit) return;
  console.log('[main] renderAllPanels start. panels=%s layer=%s', mgr.panels.length, currentLayer);
  for (const p of mgr.panels) {
    if (!p.canvas) {
      // Fallback: find or create a canvas inside the panel body.
      const existing = p.body && p.body.querySelector && p.body.querySelector('canvas');
      if (existing) {
        p.canvas = existing;
        console.log('[main] adopted existing canvas');
      } else if (p.body) {
        const cv = document.createElement('canvas');
        cv.style.width = '100%';
        cv.style.height = '100%';
        p.body.innerHTML = '';
        p.body.appendChild(cv);
        p.canvas = cv;
        console.log('[main] created missing canvas');
      }
    }
    if (!p?.canvas) continue;
    const r = p.canvas.getBoundingClientRect();
    console.log('[main] panel canvas rect %sx%s', Math.round(r.width), Math.round(r.height));
    renderCrumblePanel({canvas: p.canvas, circuit: currentCircuit, currentLayer, panelZoom});
  }
  console.log('[main] renderAllPanels done');
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
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  panelZoom = clamp(z, 0.5, 3);
  localStorage.setItem('panelZoom', String(panelZoom));
  schedulePanelsRender();
}

panelsZoomInBtn?.addEventListener('click', () => setPanelZoom(panelZoom * 1.25));
panelsZoomOutBtn?.addEventListener('click', () => setPanelZoom(panelZoom / 1.25));
panelsZoomResetBtn?.addEventListener('click', () => setPanelZoom(1));
