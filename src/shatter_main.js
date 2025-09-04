import { PanelManager } from './shatter/panel_manager.js';
import { parseStim, stringifyStim, pickAndReadFile, downloadText } from './io/import_export.js';
import { AnnotatedCircuit } from './circuit/annotated_circuit.js';
import {StateSnapshot} from './draw/state_snapshot.js';
import { renderTimeline as renderTimelineCore, computeMaxScrollCSS } from './timeline/renderer.js';
// import { renderPanel as renderCrumblePanel } from './panels/crumble_panel_renderer.js';
import {drawPanel} from './draw/main_draw.js'
import { setupTimelineUI } from './timeline/controller.js';
import { createStatusLogger } from './status/logger.js';
import { setupNameEditor, sanitizeName } from './name/editor.js';
import { setupLayerKeyboard } from './layers/keyboard.js';
import { createSheetsDropdown } from './panels/sheets_dropdown.js';
import { setupTextEditorUI } from './text_editor/controller.js';
import { EditorState } from './editor/editor_state.js';

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
  renderPanelSheetsOptions();
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

// Editor elements
const editorEl = document.getElementById('editor');
const editorResizerEl = document.getElementById('editor-resizer');
const editorToggleGlobalEl = document.getElementById('editor-toggle');
const editorToggleLocalEl = document.getElementById('editor-collapse-btn');
const editorTextareaEl = document.getElementById('editor-text');

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


/**
 * Dataflow state (text → annotated → editorState)
 * - currentText: source of truth for the whole app.
 * - annotated: parsed from text; used everywhere we previously used Circuit (timeline, panels, etc.).
 * - editorState: manages interactive edits that produce new text; we subscribe and reparse.
 */
let currentText = '';
let annotated = null;
let currentLayer = 0;
let editorState = null;
let editorDirty = false; // editor textarea differs from currentText

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

// Initialize per-panel sheets UI immediately so the initial layout is correct
renderPanelSheetsOptions();

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
  getCircuit: () => annotated,
  getCurrentLayer: () => currentLayer,
  renderWithState: ({ canvas, circuit, currentLayer: curLayer, timelineZoom, timelineScrollY }) => {
    // Note: 'circuit' here is actually our AnnotatedCircuit. It currently lacks
    // some timeline expectations, which we'll fill in later. For now this may throw.
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

// Editor UI setup (resizable + collapsible)
const editorCtl = setupTextEditorUI({
  editorEl,
  resizerEl: editorResizerEl,
  toggleGlobalEl: editorToggleGlobalEl,
  toggleLocalEl: editorToggleLocalEl,
  textareaEl: editorTextareaEl,
  rootStyle,
  onResizing: () => {
    // Keep adjacent content responsive while dragging
    renderAllPanels();
    timelineCtl.render();
  },
  onResized: () => {
    renderAllPanels();
    timelineCtl.render();
  },
});

/** Build inline per-panel sheet toggles inside each panel header. */
function renderPanelSheetsOptions() {
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
          if (!overlayState.panelSheets[i]) {
            overlayState.panelSheets[i] = new Set(sheets.map((l) => l.name));
          }
          return overlayState.panelSheets[i];
        },
        onChange: (newSet) => {
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

// Apply stim text into app state (parse, diagnostics, editor, editorState, renders)
function loadStimText(stimText) {
  try {
    currentText = String(stimText || '');
    const parsed = AnnotatedCircuit.parse(currentText);
    annotated = parsed?.annotatedCircuit || null;
    currentText = parsed?.text ?? currentText; // normalized text from parser
    currentLayer = 0;

    // Push diagnostics (common for import/reload)
    const diagnostics = parsed?.diagnostics || [];
    for (const d of diagnostics) {
      pushStatus(`[${d.code}] line ${d.line}: ${d.message}`, d.severity);
    }

    // Reflect text into editor and clear dirty state
    if (editorTextareaEl) {
      editorTextareaEl.value = currentText;
      setEditorDirty(false);
    }

    // Init or update EditorState (source of interactive edits ⇒ text). Start fresh baseline.
    ensureEditorState();
    editorState.rev.clear(currentText);

    // Render timeline/panels
    timelineCtl.setScrollY(0);
    timelineCtl.render();
    renderAllPanels();
    return true;
  } catch (e) {
    pushStatus(`Parse error: ${e?.message || e}`, 'error');
    return false;
  }
}

// Import/Export handlers
btnImport?.addEventListener('click', async () => {
  const picked = await pickAndReadFile({ accept: '.stim,.txt' });
  if (!picked) return;
  const ok = loadStimText(picked.text || '');
  if (!ok) return;
  // Update name after successful parse
  if (picked.name) {
    const nn = sanitizeName(picked.name);
    nameCtl.setName(nn);
    currentName = nn;
    localStorage.setItem(LS_KEYS.circuitName, currentName);
  }
  pushStatus(`Imported "${currentName}" (${(currentText || '').length} chars).`, 'info');
});

btnExport?.addEventListener('click', () => {
  const text = currentText || '';
  const fname = (currentName || 'circuit') + '.stim';
  downloadText(fname, text);
  pushStatus(`Exported "${currentName}.stim" (${text.length} chars).`, 'info');
});


/** Update timeline layer indicator text. */
function updateLayerIndicator() {
  const el = document.getElementById('timeline-layer-info');
  if (!el) return;
  if (!annotated) {
    el.textContent = '';
    return;
  }
  const last = Math.max(0, annotated.layers.length - 1);
  el.textContent = `Layer ${currentLayer}/${last}. Use Q/E to move.`;
}

function setLayer(layer) {
  if (!annotated) return;
  const maxLayer = Math.max(0, annotated.layers.length - 1);
  const next = clamp(Math.trunc(layer), 0, maxLayer);
  if (next === currentLayer) return;
  currentLayer = next;
  if (editorState) {
    editorState.changeCurLayerTo(currentLayer);
  }
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
  getMaxLayer: () => Math.max(0, (annotated?.layers?.length || 1) - 1),
});

/** Render all panels. */
function renderAllPanels() {
  if (!annotated) return;
  for (const p of mgr.panels) {
    const cv = p.canvas;
    // Measure for correctness; renderer may rely on CSS size for DPI/layout.
    // cv.getBoundingClientRect();
    // renderCrumblePanel({ canvas: cv, circuit: currentCircuit, currentLayer, panelZoom });

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

// ---------------------------
// Editor dataflow (text ↔ editor ↔ annotated ↔ timeline/panels)
// ---------------------------

const editorReloadBtn = document.getElementById('editor-reload');

function setEditorDirty(d) {
  editorDirty = !!d;
  if (editorReloadBtn) {
    editorReloadBtn.textContent = editorDirty ? 'Reload' : 'Up to date';
    editorReloadBtn.style.backgroundColor = editorDirty ? '#28a745' : '';
    editorReloadBtn.style.color = editorDirty ? 'white' : '';
  }
}

editorTextareaEl?.addEventListener('input', () => {
  const val = editorTextareaEl.value ?? '';
  setEditorDirty(val !== (currentText || ''));
});

editorReloadBtn?.addEventListener('click', () => {
  if (!editorTextareaEl) return;
  const newText = editorTextareaEl.value ?? '';
  if (newText === (currentText || '')) return;
  loadStimText(newText);
});

function ensureEditorState() {
  if (editorState) return editorState;
  // Prefer first panel canvas; fallback to a throwaway canvas.
  const canvas = mgr.panels?.[0]?.canvas || document.createElement('canvas');
  editorState = new EditorState(canvas);
  // Subscribe to revision changes: when a commit occurs, adopt the new text.
  editorState.rev.changes().subscribe((maybeText) => {
    if (typeof maybeText !== 'string') {
      // Preview: we can still trigger panels redraw for live previews if desired.
      schedulePanelsRender();
      return;
    }
    // Commit: this is the new source of truth.
    currentText = maybeText;
    try {
      const parsed = AnnotatedCircuit.parse(currentText);
      annotated = parsed?.annotatedCircuit || null;
      currentText = parsed?.text ?? currentText;
      if (editorTextareaEl) {
        editorTextareaEl.value = currentText;
        setEditorDirty(false);
      }
    } catch (e) {
      pushStatus(`Parse error: ${e?.message || e}`, 'error');
    }
    timelineCtl.render();
    renderAllPanels();
  });
  return editorState;
}
