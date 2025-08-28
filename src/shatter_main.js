import {PanelManager} from './shatter/panel_manager.js';
import {parseStim, stringifyStim, pickAndReadFile, downloadText} from './io/import_export.js';
import {renderTimeline as renderTimelineCore, computeMaxScrollCSS} from './timeline/renderer.js';
import {renderPanel as renderCrumblePanel} from './panels/crumble_panel_renderer.js';
import {setupTimelineUI} from './timeline/controller.js';
import {createStatusLogger} from './status/logger.js';
import {setupNameEditor, sanitizeName} from './name/editor.js';
import {setupLayerKeyboard} from './layers/keyboard.js';

const panelsEl = document.getElementById('panels');
const mgr = new PanelManager(panelsEl);

const seg = document.getElementById('layout-seg');
seg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-layout]');
  if (!btn) return;
  for (const b of seg.querySelectorAll('button')) b.classList.remove('active');
  btn.classList.add('active');
  mgr.setLayout(btn.dataset.layout);
  renderAllPanels();
  console.log('[main] layout changed to %s. panels=%s', btn.dataset.layout, mgr.panels.length);
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
const nameCtl = setupNameEditor(nameEl, currentName, {
  onCommit: (n) => { currentName = n; localStorage.setItem('circuitName', currentName); }
});

// name editor handled by name/editor.js

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
});

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
    console.log('[main] import: circuit layers=%s, panels=%s', currentCircuit.layers.length, mgr.panels.length);
    timelineCtl.setScrollY(0);
    timelineCtl.render();
    renderAllPanels();
    updateLayerIndicator();
    if (picked.name) { const nn = sanitizeName(picked.name); nameCtl.setName(nn); currentName = nn; localStorage.setItem('circuitName', currentName); }
    pushStatus(`Imported "${currentName}" (${(picked.text||'').length} chars).`, 'info');
    if (warnings?.length) {
      // Push each warning to the log, but let the latest one appear on the right.
      for (const w of warnings) pushStatus(w, 'warning');
      // After pushing warnings, show an info message so the latest warning sits on the right side.
      pushStatus(`Import produced ${warnings.length} warning(s).`, 'info');
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
  renderAllPanels();
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
    if (!p?.canvas) continue;
    const r = p.canvas.getBoundingClientRect();
    console.log('[main] panel canvas rect %sx%s', Math.round(r.width), Math.round(r.height));
    renderCrumblePanel({canvas: p.canvas, circuit: currentCircuit, currentLayer});
  }
  console.log('[main] renderAllPanels done');
}

window.addEventListener('resize', () => {
  renderAllPanels();
});
