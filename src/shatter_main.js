import { PanelManager } from './ui_elements/panel_manager.js';
import { parseStim, stringifyStim, pickAndReadFile, downloadText } from './io/import_export.js';
import { AnnotatedCircuit } from './circuit/annotated_circuit.js';
import { Sheet } from './circuit/sheet.js';
import { renderTimeline as renderTimelineCore, computeMaxScrollCSS } from './ui_elements/timeline_renderer.js';
import { drawPanel } from './draw/draw_panel.js'
import { setGateStyle } from './draw/gate_style.js';
import { torusSegmentsBetween } from './draw/draw_panel.js'
import { setupTimelineUI } from './ui_elements/timeline_controller.js';
import { setupResizablePane } from './util/ui_utils.js';
import { renderInspector } from './ui_elements/inspector_renderer.js';
import { createStatusLogger } from './ui_elements/status_logger.js';
import { setupNameEditor, sanitizeName } from './ui_elements/name_editor.js';
// Unified keymap handles all keyboard shortcuts via settings (see settings_default.json)
import { createKeymap } from './keyboard/keymap.js';
import { loadSettings, saveUserSettings, exportUserSettings, importUserSettings } from './settings/settings.js';
import { setTerminalErrorsEnabled } from './circuit/propagated_pauli_frames.js';
import { createSheetsDropdown } from './ui_elements/sheets_dropdown.js';
import { setupTextEditorUI } from './ui_elements/text_editor_controller.js';
import { setupMarkersUI as setupToolboxUI } from './ui_elements/markers_controller.js';
import { renderMarkers as renderToolbox } from './ui_elements/markers_renderer.js';
import { GatePlacementController } from './editor/gate_placement_controller.js';
import { EdgeChainPlacementController, PolygonChainPlacementController } from './editor/shape_placement_controller.js';
import { GATE_MAP } from './gates/gateset.js';
import { Operation } from './circuit/operation.js';
import { deleteSelection } from './editor/delete_controller.js';
import { setupSettingsUI } from './ui_elements/settings_controller.js';
import { pitch, OFFSET_X, OFFSET_Y, rad } from './draw/config.js';
import { draw_x_control, draw_y_control, draw_z_control, draw_swap_control, draw_iswap_control, draw_xswap_control, draw_zswap_control } from './gates/gate_draw_util.js';
import { EditorState } from './editor/editor_state.js';
import { selectionStore } from './editor/selection_store.js';
import { hitTestAt } from './draw/hit_test.js';
import { xyToPos } from './draw/draw_panel.js';
import { parseHashParams, writeHashFromCircuit, encodeCircuitToHash } from './io/url_sync.js';

const panelsEl = document.getElementById('panels');
const mgr = new PanelManager(panelsEl);
let _lastOverlayDebugTs = 0; // TEMP: throttle overlay debug pings
// (debug removed): no phantom status spam tracking

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
const timelineFocusBtn = document.getElementById('timeline-focus-toggle');
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
const btnCopyUrl = document.getElementById('btn-copy-url');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnInsertLayer = document.getElementById('btn-insert-layer');
const btnDeleteLayer = document.getElementById('btn-delete-layer');
// Theme elements
const themeLinkEl = document.getElementById('theme-link');
const themeSelectEl = document.getElementById('theme-select');
// Settings elements
const settingsEl = document.getElementById('settings');
const settingsResizerEl = document.getElementById('settings-resizer');
const settingsToggleGlobalEl = document.getElementById('settings-toggle-global');
const settingsToggleLocalEl = document.getElementById('settings-collapse-btn');
const settingsBodyEl = document.getElementById('settings-body');
const settingsExportBtn = document.getElementById('settings-export-btn');
const settingsImportBtn = document.getElementById('settings-import-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');


// Inspector elements (skeleton present in HTML)
const inspectorEl = document.getElementById('inspector');
const inspectorResizerEl = document.getElementById('inspector-resizer');
// Note: both header and local buttons share id 'inspector-toggle' in HTML skeleton.
const inspectorToggleGlobalEl = document.getElementById('inspector-toggle-global');
const inspectorToggleLocalEl = document.getElementById('inspector-collapse-btn');

// Toolbox elements
const toolboxEl = document.getElementById('toolbox');
const toolboxToggleGlobalEl = document.getElementById('toolbox-toggle-global');
const toolboxToggleLocalEl = document.getElementById('toolbox-toggle');

// Editor elements
const editorEl = document.getElementById('editor');
const editorResizerEl = document.getElementById('editor-resizer');
const editorToggleGlobalEl = document.getElementById('editor-toggle');
const editorToggleLocalEl = document.getElementById('editor-collapse-btn');
const editorTextareaEl = document.getElementById('editor-text');

const rootStyle = document.documentElement.style;
// Current target sheet for new items created via toolbox/phantoms (session-scoped)
let _targetSheetName = 'DEFAULT';

// URL hash updates are coupled to text updates only (same content as editor)

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

// Expose logger to EditorState for info messages (e.g., marker toggles)
function hookEditorLogger(es) {
  if (!es) return;
  try {
    es.onInfo = (msg) => { try { pushStatus(String(msg || ''), 'info'); } catch {} };
  } catch {}
}


/**
 * Dataflow state (text → annotated → editorState)
 * - currentText: source of truth for the whole app.
 * - annotated: parsed from text; used everywhere we previously used Circuit (timeline, panels, etc.).
 * - editorState: manages interactive edits that produce new text; we subscribe and reparse.
 */
let currentText = '';
let circuit = null;
let currentLayer = 0;
let editorState = null;
let editorDirty = false; // editor textarea differs from currentText
let lastDiagnosticsCount = 0; // count from the most recent parse/load

/** Clear the right-hand status (recent warning/error) indicator. */
function clearStatusRight() {
  if (statusTextRight) statusTextRight.textContent = '';
  if (statusDotRight) statusDotRight.style.background = '#8b949e'; // info grey, matches logger
}

let currentName = localStorage.getItem(LS_KEYS.circuitName) || 'circuit';
let panelZoom = Number.parseFloat(localStorage.getItem(LS_KEYS.panelZoom) || '2');

const nameCtl = setupNameEditor(nameEl, currentName, {
  onCommit: (n) => {
    currentName = n;
    localStorage.setItem(LS_KEYS.circuitName, n);
  },
});

// Overlay state
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

// Theme switching
(function initThemeSelector(){
  if (!themeLinkEl || !themeSelectEl) return;
  const LS_THEME_KEY = 'appThemeName';
  const map = {
    'boring': './src/styles/theme.css',
    'purple-charcoal': './src/styles/theme-legacy.css',
    'seventies': './src/styles/theme-seventies.css',
    'quantum-hacker-bro': './src/styles/theme-hacker.css',
  };
  const badgeMap = {
    'boring': '',
    'purple-charcoal': '',
    'seventies': '',
    'quantum-hacker-bro': './src/assets/pictures/music-saturation.gif',
  };
  const setHeaderTitleForTheme = (name) => {
    try {
      const h = document.querySelector('header h1');
      if (!h) return;
      if (name === 'quantum-hacker-bro') {
        h.textContent = 'SH@TT3R (W1P)';
      } else {
        h.textContent = 'Shatter (WIP)';
      }
    } catch {}
  };
  const apply = (name) => {
    const href = map[name] || map['default'];
    themeLinkEl.href = href;
    localStorage.setItem(LS_THEME_KEY, name);
    setHeaderTitleForTheme(name);
    try {
      const img = document.getElementById('theme-badge');
      const src = badgeMap[name] || '';
      if (img) {
        if (src) { img.src = src; img.style.display = 'inline-block'; }
        else { img.style.display = 'none'; img.removeAttribute('src'); }
      }
    } catch {}
  };
  let cur = localStorage.getItem(LS_THEME_KEY) || 'boring';
  // Migrate old stored values
  if (cur === 'default') cur = 'boring';
  if (cur === 'legacy') cur = 'purple-charcoal';
  if (cur === 'hacker') cur = 'quantum-hacker-bro';
  if (themeSelectEl.value !== cur) themeSelectEl.value = cur;
  apply(cur);
  themeSelectEl.addEventListener('change', () => apply(themeSelectEl.value));
})();

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
  getCircuit: () => circuit,
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
    const tset = (editorState && editorState.timelineSet) ? editorState.timelineSet : new Map();
    renderTimelineCore({ canvas, circuit, currentLayer: curLayer, timelineZoom, timelineScrollY, timelineSet: tset });
    updateLayerIndicator();
    // Update focus button state when timeline renders/collapses
    try { updateTimelineFocusButton(); } catch {}
  },
  onResizing: () => {
    renderAllPanels();
  },
  onResized: () => {
    renderAllPanels();
    try { updateTimelineFocusButton(); } catch {}
  },
});

// Inspector UI setup (resizable + collapsible) using the common resizable pane helper.
if (inspectorEl && inspectorResizerEl) {
  const updateInspectorToggleText = (collapsed) => {
    if (inspectorToggleGlobalEl) inspectorToggleGlobalEl.textContent = collapsed ? 'Show inspector' : 'Hide inspector';
    if (inspectorToggleLocalEl) inspectorToggleLocalEl.textContent = collapsed ? 'Show' : 'Hide';
  };
  setupResizablePane({
    paneEl: inspectorEl,
    resizerEl: inspectorResizerEl,
    rootStyle,
    cssVar: '--inspector-width',
    lsWidthKey: 'inspectorWidth',
    lsCollapsedKey: 'inspectorCollapsed',
    defaultWidthPx: 320,
    defaultCollapsed: true,
    toggleEls: [inspectorToggleGlobalEl, inspectorToggleLocalEl].filter(Boolean),
    onCollapsedChanged: () => {
      // Keep adjacent content responsive
      renderAllPanels();
      timelineCtl.render();
      renderToolboxUI();
      renderInspectorUI();
    },
    onResizing: () => {
      renderAllPanels();
      timelineCtl.render();
      renderToolboxUI();
      renderInspectorUI();
    },
    onResized: () => {
      renderAllPanels();
      timelineCtl.render();
      renderToolboxUI();
      renderInspectorUI();
    },
    updateToggleText: updateInspectorToggleText,
  });
}

// Settings UI (resizable + collapsible) mirrors inspector/editor structure.
if (settingsEl && settingsResizerEl) {
  setupResizablePane({
    paneEl: settingsEl,
    resizerEl: settingsResizerEl,
    rootStyle,
    cssVar: '--settings-width',
    lsWidthKey: 'settingsWidth',
    lsCollapsedKey: 'settingsCollapsed',
    defaultWidthPx: 320,
    defaultCollapsed: true,
    toggleEls: [settingsToggleGlobalEl, settingsToggleLocalEl].filter(Boolean),
    onCollapsedChanged: () => {
      renderAllPanels();
      timelineCtl.render();
      renderToolboxUI();
      renderInspectorUI();
    },
    onResizing: () => {
      renderAllPanels();
      timelineCtl.render();
    },
    onResized: () => {
      renderAllPanels();
      timelineCtl.render();
    },
    // Settings toggle button shows a constant cog, so no toggle text to update.
    updateToggleText: () => {},
  });
}

let inspectorRenderScheduled = false;
function renderInspectorUI() {
  if (inspectorRenderScheduled) return;
  inspectorRenderScheduled = true;
  requestAnimationFrame(() => {
    inspectorRenderScheduled = false;
    try {
      const container = document.querySelector('#inspector .inspector-body');
      if (!container) return;
      renderInspector({ containerEl: container, circuit, curLayer: currentLayer });
    } catch {}
  });
}

// Editor UI setup (resizable + collapsible)
const editorCtl = setupTextEditorUI({
  editorEl,
  resizerEl: editorResizerEl,
  toggleGlobalEl: editorToggleGlobalEl,
  toggleLocalEl: editorToggleLocalEl,
  textareaEl: editorTextareaEl,
  rootStyle,
  defaultCollapsed: true,
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

// Toolbox UI setup (fixed width, collapsible)
let toolboxCtl = null;
if (toolboxEl) {
  toolboxCtl = setupToolboxUI({
    markersEl: toolboxEl,
    toggleGlobalEl: toolboxToggleGlobalEl,
    toggleLocalEl: toolboxToggleLocalEl,
    onToggle: () => renderToolboxUI(),
  });
}

let toolboxRenderScheduled = false;
function renderToolboxUI() {
  if (toolboxRenderScheduled) return;
  toolboxRenderScheduled = true;
  requestAnimationFrame(() => {
    toolboxRenderScheduled = false;
    try {
      const container = document.getElementById('toolbox-body');
      if (!container || !toolboxEl || toolboxEl.classList.contains('collapsed')) return;
      let canToggle = false;
      try {
        const snapSel = selectionStore.snapshot();
        canToggle = !!(snapSel && ['qubit','gate','connection','polygon'].includes(snapSel.kind) && snapSel.selected.size > 0);
      } catch {}
      const snap = editorState?.obs_val_draw_state.get?.();
      // Render marker rows first
      renderToolbox({
        containerEl: container,
        circuit,
        currentLayer,
        propagated: snap?.propagatedFrames,
        canToggle,
        onClearIndex: (idx) => { try { editorState?.clearMarkersIndex?.(idx); renderToolboxUI(); schedulePanelsRender(); } catch {} },
        onToggleType: (gateName, idx) => { try { editorState?.toggleMarkerAtSelection?.(false, gateName, idx); renderToolboxUI(); schedulePanelsRender(); } catch {} },
        onStartGatePlacement: (gateId) => {
          try {
            const g = GATE_MAP.get(gateId);
            const hasSel = !!editorState && editorState.get_selected_qubits && editorState.get_selected_qubits().size > 0;
            if (g && g.num_qubits === 1 && hasSel) {
              const qids = [...editorState.get_selected_qubits().values()];
              const layer = currentLayer;
              const c = editorState.copyOfCurAnnotatedCircuit();
              const annLayer = c.layers[layer];
              const occupied = (q)=> annLayer && annLayer.id_ops && annLayer.id_ops.has(q);
              if (qids.some(occupied)) {
                pushStatus('Cannot place: one or more selected qubits are occupied at this layer.', 'warning');
                return;
              }
              try {
                for (const q of qids) {
                  const op = new Operation(g, '', new Float32Array([]), new Uint32Array([q]), -1);
                  annLayer.put(op, false);
                }
                editorState._pendingDesc = `Add ${gateId}`;
                editorState.commit(c);
                pushStatus(`Added ${gateId} at layer ${layer} on ${qids.length} qubit(s).`, 'info');
                schedulePanelsRender();
                renderToolboxUI();
                return;
              } catch (e) {
                pushStatus('Failed to place gates on selection.', 'error');
                return;
              }
            }
          } catch {}
          gatePlacement.start(gateId);
        },
        activeGateId: gatePlacement.activeGateId,
        flashGateId,
        getTargetSheet: () => _targetSheetName,
        setTargetSheet: (name) => { _targetSheetName = name || 'DEFAULT'; try { renderToolboxUI(); schedulePanelsRender(); } catch {} },
        onAddPolygon: (color) => {
          try {
            if (!editorState) return;
            const ordered = selectionStore.orderedEntries?.() || [];
            const qids = ordered.filter(e => (e.kind === 'qubit') && e.id.startsWith('q:'))
              .map(e => parseInt(e.id.split(':')[1]))
              .filter(n => Number.isFinite(n));
            // Normalize fill color to (r,g,b,a)
            const toTupleFill = (cstr) => {
              try {
                const s = String(cstr).trim();
                const m = s.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i);
                if (m) return `(${parseInt(m[1])}, ${parseInt(m[2])}, ${parseInt(m[3])}, ${parseFloat(m[4])})`;
                const n = s.replace(/[()]/g, '');
                if (/^(\d+\s*,\s*){3}[0-9.]+$/.test(n)) return `(${n})`;
              } catch {}
              return '(0,0,0,0.25)';
            };
            const fillTuple = toTupleFill(color);
            if (qids.length >= 1) {
              // Immediate polygon from selection (allow 1 or 2 vertices too)
              const c = editorState.copyOfCurAnnotatedCircuit();
              const layerIdx = currentLayer;
              while (c.layers.length <= layerIdx) c.layers.push(c.layers[c.layers.length-1]?.copy?.() || new (c.layers[0].constructor)());
              const anns = c.layers[layerIdx].annotations = c.layers[layerIdx].annotations || [];
              const polyIndex = anns.filter(a => a && a.kind === 'Polygon').length;
              const sheetName = _targetSheetName || 'DEFAULT';
              anns.push({ kind: 'Polygon', sheet: sheetName, stroke: 'none', fill: fillTuple, targets: qids.slice(), polyIndex });
              editorState._pendingDesc = 'Add polygon';
              editorState.commit(c);
              pushStatus(`Added polygon on sheet ${sheetName} at layer ${layerIdx}.`, 'info');
              renderToolboxUI(); schedulePanelsRender();
            } else {
              // Start polygon chaining placement
              try { if (gatePlacement?.isActive?.()) gatePlacement.cancel?.(); } catch {}
              try { if (edgePlacement?.isActive?.()) edgePlacement.cancel?.(); } catch {}
              polyPlacement.start(fillTuple);
            }
          } catch (e) {
            try { pushStatus(`Failed to add polygon: ${e?.message||e}`, 'error'); } catch {}
          }
        },
        onAddEdge: (color) => {
          try {
            if (!editorState) return;
            const ordered = selectionStore.orderedEntries?.() || [];
            const qids = ordered.filter(e => (e.kind === 'qubit') && e.id.startsWith('q:'))
              .map(e => parseInt(e.id.split(':')[1]))
              .filter(n => Number.isFinite(n));
            if (qids.length === 2) {
              // Immediate single edge
              const edges = [];
              const a = Math.min(qids[0], qids[1]);
              const b = Math.max(qids[0], qids[1]);
              edges.push([a,b]);
              const c = editorState.copyOfCurAnnotatedCircuit();
              const layerIdx = currentLayer;
              while (c.layers.length <= layerIdx) c.layers.push(c.layers[c.layers.length-1]?.copy?.() || new (c.layers[0].constructor)());
              const anns = c.layers[layerIdx].annotations = c.layers[layerIdx].annotations || [];
              const sheetName = _targetSheetName || 'DEFAULT';
              anns.push({ kind: 'ConnSet', sheet: { name: sheetName }, edges, colour: color });
              editorState._pendingDesc = 'Add edge';
              editorState.commit(c);
              pushStatus(`Added edge on sheet ${sheetName} at layer ${layerIdx}.`, 'info');
              renderToolboxUI(); schedulePanelsRender();
            } else {
              // Start edge chaining placement
              try { if (gatePlacement?.isActive?.()) gatePlacement.cancel?.(); } catch {}
              try { if (polyPlacement?.isActive?.()) polyPlacement.cancel?.(); } catch {}
              edgePlacement.start(color);
            }
          } catch (e) {
            try { pushStatus(`Failed to add edge(s): ${e?.message||e}`, 'error'); } catch {}
          }
        },
      });
      // No toolbox grid appended (using only marker rows for now).
    } catch {}
  });
}



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
          reconcileSelectionVisibility();
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
    circuit = parsed?.circuit || null;
    currentText = parsed?.text ?? currentText; // normalized text from parser
    try { setGateStyle(circuit?.gateStyle || {}); } catch {}
    currentLayer = 0;

    // Push diagnostics (common for import/reload)
    const diagnostics = parsed?.diagnostics || [];
    lastDiagnosticsCount = diagnostics.length;
    for (const d of diagnostics) {
      pushStatus(`[${d.code}] line ${d.line}: ${d.message}`, d.severity);
    }
    if (lastDiagnosticsCount === 0) {
      // No issues from this action: clear stale right-hand warning/error indicator.
      clearStatusRight();
    }

    // Reflect text into editor and clear dirty state
    if (editorTextareaEl) {
      editorTextareaEl.value = currentText;
      setEditorDirty(false);
      try { writeHashFromCircuit(currentText); } catch {}
    }

    // Init or update EditorState (source of interactive edits ⇒ text). Start fresh baseline.
    ensureEditorState();
    editorState.rev.clear(currentText, 'Loaded circuit');
    // Precompute propagation and push a snapshot immediately so first render uses cache.
    try {
      const propagated = editorState._computePropagationCache(circuit);
      editorState.obs_val_draw_state.set(editorState.toSnapshot(circuit, propagated));
    } catch {}
    // Update Undo/Redo availability after establishing baseline
    try {
      if (btnUndo) btnUndo.disabled = editorState.rev.isAtBeginningOfHistory();
      if (btnRedo) btnRedo.disabled = editorState.rev.isAtEndOfHistory();
    } catch {}

    // Reset timeline scroll; rendering will occur via snapshot subscription.
    timelineCtl.setScrollY(0);
    // Update sheet list for dropdowns from the parsed circuit.
    try {
      if (circuit?.sheets && typeof circuit.sheets.size === 'number') {
        overlayState.sheets = Array.from(circuit.sheets.keys()).map(name => ({ name }));
      } else {
        overlayState.sheets = DEFAULT_SHEETS;
      }
      // Initialize target sheet for new items based on circuit sheets
      try {
        const names = overlayState.sheets.map(s=>s.name);
        _targetSheetName = names.includes('DEFAULT') ? 'DEFAULT' : (names[0] || 'DEFAULT');
      } catch {}
      // Ensure panel 0 starts with all sheets visible on first import.
      if (overlayState.sheets.length > 0) {
        overlayState.panelSheets[0] = new Set(overlayState.sheets.map(s => s.name));
      }
      renderPanelSheetsOptions();
      schedulePanelsRender();
      renderInspectorUI();
    } catch {}
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
  if (lastDiagnosticsCount === 0) {
    clearStatusRight();
  }
});

btnExport?.addEventListener('click', () => {
  const text = currentText || '';
  const fname = (currentName || 'circuit') + '.stim';
  downloadText(fname, text);
  pushStatus(`Exported "${currentName}.stim" (${text.length} chars).`, 'info');
});

// Copy URL (ensures URL hash reflects current circuit before copying)
btnCopyUrl?.addEventListener('click', async () => {
  let url = window.location.href;
  try {
    // Prefer a fresh toStimCircuit serialization to ensure overlays (POLY/POLYGON) are paired.
    let textForUrl = currentText || '';
    try {
      if (editorState) {
        const c = editorState.copyOfCurAnnotatedCircuit();
        textForUrl = c.toStimCircuit();
      }
    } catch {}
    const hash = encodeCircuitToHash(textForUrl || '');
    // Build full URL manually to avoid any async replaceState timing.
    url = window.location.origin + window.location.pathname + hash;
  } catch {}
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      pushStatus('Copied URL to clipboard.', 'info');
    } else {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      pushStatus('Copied URL to clipboard.', 'info');
    }
  } catch (e) {
    try { console.error(e); } catch {}
    pushStatus('Copy failed. You can copy from the address bar.', 'warning');
  }
});


/** Update timeline layer indicator text. */
function updateLayerIndicator() {
  const el = document.getElementById('timeline-layer-info');
  if (!el) return;
  if (!circuit) {
    const f = el.querySelector('.full');
    const c = el.querySelector('.compact');
    if (f) f.textContent = '';
    if (c) c.textContent = '';
    return;
  }
  const last = Math.max(0, circuit.layers.length - 1);
  const f = el.querySelector('.full');
  const c = el.querySelector('.compact');
  const getFirstBinding = (id, fallback) => {
    try {
      const b = appSettings?.keybindings?.commands?.[id]?.bindings;
      if (Array.isArray(b) && b.length > 0) return String(b[0]);
    } catch {}
    return fallback;
  };
  const prevKey = getFirstBinding('layer.prev', 'Q');
  const nextKey = getFirstBinding('layer.next', 'E');
  const fullTxt = `Layer ${currentLayer}/${last}. Use ${prevKey}/${nextKey} to move.`;
  const compactTxt = `${currentLayer}/${last} (${prevKey}/${nextKey})`;
  if (f) f.textContent = fullTxt; else el.textContent = fullTxt;
  if (c) c.textContent = compactTxt;
}

function setLayer(layer) {
  if (!circuit) return;
  const maxLayer = Math.max(0, circuit.layers.length - 1);
  const next = clamp(Math.trunc(layer), 0, maxLayer);
  if (next === currentLayer) return;
  currentLayer = next;
  if (editorState) {
    editorState.changeCurLayerTo(currentLayer);
  }
  timelineCtl.render();
  updateLayerIndicator();
  // Prune selection based on new layer visibility.
  reconcileSelectionVisibility();
  schedulePanelsRender();
  renderToolboxUI();
  renderInspectorUI();
}

// Recompute propagation (e.g., when feature toggles affect visibility) and re-render panels/timeline/inspector
function recomputePropagationAndRender() {
  try {
    if (!editorState) return;
    const snapCircuit = circuit || editorState.copyOfCurAnnotatedCircuit();
    const propagated = editorState._computePropagationCache(snapCircuit);
    editorState.obs_val_draw_state.set(editorState.toSnapshot(snapCircuit, propagated));
    timelineCtl.render();
    renderAllPanels();
    renderToolboxUI();
    renderInspectorUI();
  } catch {}
}

function shouldReloadOnFeature(name) {
  // Internal policy: only specific features require a full recompute.
  // terminalErrors affects the propagated frames content, so reload for it.
  return name === 'terminalErrors';
}

// Unified keymap bindings (driven by settings).
const keymap = createKeymap();
// Commands
const isEditing = () => {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.isContentEditable) return true;
  return false;
};
// Register commands (bindings applied from settings after load)
keymap.registerCommand('layer.prev', () => setLayer(currentLayer - 1), { when: () => !isEditing() && !!circuit });
keymap.registerCommand('layer.next', () => setLayer(currentLayer + 1), { when: () => !isEditing() && !!circuit });
  keymap.registerCommand('layer.prev.fast', () => setLayer(currentLayer - 5), { when: () => !isEditing() && !!circuit });
  keymap.registerCommand('layer.next.fast', () => setLayer(currentLayer + 5), { when: () => !isEditing() && !!circuit });
  keymap.registerCommand('edit.undo', () => { const d = editorState?.undo?.(); if (d !== undefined) pushStatus(`Undid ${d || 'change'}`, 'info'); }, { when: () => !isEditing() && !!editorState });
  keymap.registerCommand('edit.redo', () => { const d = editorState?.redo?.(); if (d !== undefined) pushStatus(`Redid ${d || 'change'}`, 'info'); }, { when: () => !isEditing() && !!editorState });
  // Clear selection (Escape) only when not actively placing a gate (that handler owns Escape).
  keymap.registerCommand(
    'selection.clear',
    () => {
      try {
        selectionStore.clear();
        schedulePanelsRender();
        renderToolboxUI();
        renderInspectorUI();
      } catch {}
    },
    { when: () => !isEditing() && !(gatePlacement?.isActive?.() || edgePlacement?.isActive?.() || polyPlacement?.isActive?.()) }
  );
  keymap.registerCommand('edit.delete', () => { try { if (deleteSelection(editorState, currentLayer, pushStatus)) { schedulePanelsRender(); renderToolboxUI(); renderInspectorUI(); } } catch (e) { try { pushStatus(`Delete failed: ${e?.message||e}`, 'error'); } catch {} } }, { when: () => !isEditing() && !!editorState });
  keymap.registerCommand('panel.zoom.in', () => setPanelZoom(panelZoom * 1.25), { when: () => !isEditing() });
keymap.registerCommand('panel.zoom.out', () => setPanelZoom(panelZoom / 1.25), { when: () => !isEditing() });
  keymap.registerCommand('panel.zoom.reset', () => setPanelZoom(2), { when: () => !isEditing() });
  keymap.registerCommand('layer.insert', () => { try { editorState?.insertLayer?.(false); } catch {} }, { when: () => !isEditing() && !!editorState });
  keymap.registerCommand('layer.delete', () => { try { editorState?.deleteCurLayer?.(false); } catch {} }, { when: () => !isEditing() && !!editorState });

let appSettings = null;
function applySettings() {
  if (!appSettings) return;
  try { setTerminalErrorsEnabled(!!appSettings?.features?.terminalErrors); } catch {}
  try {
    const cmds = appSettings?.keybindings?.commands || {};
    for (const id of Object.keys(cmds)) {
      const pats = Array.isArray(cmds[id]?.bindings) ? cmds[id].bindings : [];
      keymap.setDefaultBindings(id, pats);
    }
  } catch {}
}

async function initSettingsAndKeymap() {
  appSettings = await loadSettings();
  applySettings();
  keymap.attach();
  // Expose for debugging/console edits
  // @ts-ignore
  window.__keymap = keymap;
  // @ts-ignore
  window.__settings = {
    get: () => appSettings,
    setKeybinding: (id, pats) => { if (!appSettings.keybindings.commands[id]) appSettings.keybindings.commands[id] = { name: id, bindings: [] }; appSettings.keybindings.commands[id].bindings = [...pats]; keymap.setDefaultBindings(id, pats); },
    save: () => saveUserSettings(appSettings),
    export: () => exportUserSettings(),
    import: (obj) => { importUserSettings(obj); },
  };
}

initSettingsAndKeymap().then(() => {
  try {
    setupSettingsUI({
      containerEl: settingsBodyEl,
      importBtn: settingsImportBtn,
      exportBtn: settingsExportBtn,
      saveBtn: settingsSaveBtn,
      getSettings: () => appSettings,
      onToggleFeature: (name, val) => {
        appSettings.features[name] = !!val;
        saveUserSettings(appSettings);
        applySettings();
        pushStatus('Saved settings', 'info');
        if (shouldReloadOnFeature(name)) {
          recomputePropagationAndRender();
        }
      },
      onSaveKeybindings: (updatesMap) => {
        // Apply all updates atomically
        for (const [id, pats] of updatesMap.entries()) {
          if (!appSettings.keybindings.commands[id]) appSettings.keybindings.commands[id] = { name: id, bindings: [] };
          appSettings.keybindings.commands[id].bindings = [...pats];
        }
        saveUserSettings(appSettings);
        applySettings();
        // Reflect changes immediately (e.g., layer indicator keybinds)
        try { timelineCtl.render(); } catch {}
        try { updateLayerIndicator(); } catch {}
        try { schedulePanelsRender(); } catch {}
      },
      onSaveGeneral: (updatesObj) => {
        // Shallow merge per section, create if missing
        for (const sec of Object.keys(updatesObj || {})) {
          appSettings[sec] = appSettings[sec] || {};
          Object.assign(appSettings[sec], updatesObj[sec]);
        }
        saveUserSettings(appSettings);
        applySettings();
        // If appearance affects visuals (e.g., focusDim), re-render panels
        try { schedulePanelsRender(); } catch {}
        try { timelineCtl.render(); } catch {}
        try { updateLayerIndicator(); } catch {}
      },
      onImportSettings: async (obj) => {
        importUserSettings(obj);
        appSettings = await loadSettings();
        applySettings();
        try { schedulePanelsRender(); } catch {}
        try { timelineCtl.render(); } catch {}
        try { updateLayerIndicator(); } catch {}
      },
      onExportSettings: () => exportUserSettings(),
      pushStatus,
    });
  } catch {}
});

// (moved below editor initialization to avoid TDZ on editorReloadBtn)

/** Render all panels. */
function renderAllPanels() {
  if (!circuit) return;
  const snap = editorState ? editorState.obs_val_draw_state.get() : null;
  if (!snap) return;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const timelineCollapsed = !!timelineCtl.getCollapsed?.();
  for (let i = 0; i < mgr.panels.length; i++) {
    const p = mgr.panels[i];
    const canvas = p.canvas;
    if (!canvas) continue;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Apply panel zoom uniformly; origin at top-left.
    // Resolve sheet selection for this panel to pass into drawPanel.
    // Use existing selection set if present; otherwise default to all known sheets.
    let sheetsSel = overlayState.panelSheets[i];
    if (!sheetsSel) {
      const sheets = getSheetsSafe();
      sheetsSel = new Set(sheets.map(s => s.name));
    }

    if (panelZoom && panelZoom !== 1) {
      ctx.save();
      ctx.scale(panelZoom, panelZoom);
      drawPanel(ctx, snap, sheetsSel, { timelineCollapsed, focusDim: (appSettings && appSettings.appearance && typeof appSettings.appearance.focusDim==='number') ? appSettings.appearance.focusDim : 0.2 });
      try { drawGatePlacementOverlay(ctx, circuit, sheetsSel); } catch {}
      try { drawShapePlacementOverlays(ctx, circuit, sheetsSel); } catch {}
      ctx.restore();
    } else {
      drawPanel(ctx, snap, sheetsSel, { timelineCollapsed, focusDim: (appSettings && appSettings.appearance && typeof appSettings.appearance.focusDim==='number') ? appSettings.appearance.focusDim : 0.2 });
      try { drawGatePlacementOverlay(ctx, circuit, sheetsSel); } catch {}
      try { drawShapePlacementOverlays(ctx, circuit, sheetsSel); } catch {}
    }
    // Bind mouse events once per canvas.
    if (!p._eventsBound) {
      bindPanelMouse(p, i);
      p._eventsBound = true;
    }
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
panelsZoomResetBtn?.addEventListener('click', () => setPanelZoom(2));

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

// Load from URL hash on startup and when navigating history
(function initCircuitFromHash() {
  try {
    const m = parseHashParams();
    const v = m.get('circuit');
    if (typeof v === 'string' && v.length > 0) {
      loadStimText(v);
      pushStatus('Loaded circuit from URL.', 'info');
    }
  } catch {}
  window.addEventListener('popstate', () => {
    try {
      const m = parseHashParams();
      const v = m.get('circuit');
      loadStimText(v || '');
    } catch {}
  });
})();

// If nothing loaded yet, start with an empty circuit so the UI is visible immediately.
try {
  if (!circuit) {
    loadStimText('');
    pushStatus('Started new empty circuit.', 'info');
  }
} catch {}

function ensureEditorState() {
  if (editorState) return editorState;
  // Prefer first panel canvas; fallback to a throwaway canvas.
  const canvas = mgr.panels?.[0]?.canvas || document.createElement('canvas');
  editorState = new EditorState(canvas);
  hookEditorLogger(editorState);
  // Wire layer insert/delete buttons
  if (btnInsertLayer) btnInsertLayer.onclick = () => { try { editorState?.insertLayer?.(false); } catch {} };
  if (btnDeleteLayer) btnDeleteLayer.onclick = () => { try { editorState?.deleteCurLayer?.(false); } catch {} };
  // Wire Undo/Redo buttons; log via returned descriptions.
  if (btnUndo) btnUndo.onclick = () => {
    try {
      const d = editorState.undo();
      if (d !== undefined) pushStatus(`Undid ${d || 'change'}`, 'info');
    } catch {}
  };
  if (btnRedo) btnRedo.onclick = () => {
    try {
      const d = editorState.redo();
      if (d !== undefined) pushStatus(`Redid ${d || 'change'}`, 'info');
    } catch {}
  };
  // Subscribe to revision changes: when a commit occurs, adopt the new text.
  editorState.rev.changes().subscribe((maybeText) => {
    // Sync emitted text back into editor and top-level circuit.
    if (typeof maybeText === 'string') {
      currentText = maybeText;
      try {
        const parsed = AnnotatedCircuit.parse(currentText);
        circuit = parsed?.circuit || null;
        currentText = parsed?.text ?? currentText;
        try { setGateStyle(circuit?.gateStyle || {}); } catch {}
        // Restore timeline focus for this revision if recorded
        try {
          const hist = editorState?._timelineSetHistory;
          if (hist && hist.has(editorState.rev.index)) {
            editorState.timelineSet = new Map(hist.get(editorState.rev.index).entries());
          }
        } catch {}
        if (editorTextareaEl) {
          editorTextareaEl.value = currentText;
          setEditorDirty(false);
          try { writeHashFromCircuit(currentText); } catch {}
        }
      } catch (e) {
        pushStatus(`Parse error: ${e?.message || e}`, 'error');
      }
    }
    // Trigger a fresh snapshot with cached propagation frames.
    try {
      const snapCircuit = circuit || editorState.copyOfCurAnnotatedCircuit();
      const propagated = editorState._computePropagationCache(snapCircuit);
      editorState.obs_val_draw_state.set(editorState.toSnapshot(snapCircuit, propagated));
    } catch {
      editorState.obs_val_draw_state.set(editorState.toSnapshot(undefined));
    }
    // Logging is handled at call sites (buttons / future shortcuts).
    // Update Undo/Redo availability
    try {
      if (btnUndo) btnUndo.disabled = editorState.rev.isAtBeginningOfHistory();
      if (btnRedo) btnRedo.disabled = editorState.rev.isAtEndOfHistory();
    } catch {}
  });
  // Draw panels on snapshot changes, mirroring stim_crumble's render loop.
  editorState.obs_val_draw_state.observable().subscribe(ds => {
    requestAnimationFrame(() => {
      renderAllPanels(ds);
      timelineCtl.render();
      renderToolboxUI();
      renderInspectorUI();
    });
  });
  // Redraw panels and inspector on selection changes; mirror qubit selections into EditorState.focusedSet
  selectionStore.subscribe(() => {
    try {
      if (editorState && circuit) {
        const snapSel = selectionStore.snapshot();
        const newFocus = new Map();
        if (snapSel.kind === 'qubit' && snapSel.selected && snapSel.selected.size > 0) {
          for (const id of snapSel.selected) {
            const parts = String(id || '').split(':');
            if (parts[0] !== 'q') continue;
            const qid = parseInt(parts[1]);
            const q = circuit.qubits?.get?.(qid);
            if (!q) continue;
            const x = q.stimX, y = q.stimY;
            if (typeof x === 'number' && typeof y === 'number') {
              newFocus.set(`${x},${y}`, [x, y]);
            }
          }
        }
        editorState.focusedSet = newFocus;
      }
    } catch {}
    schedulePanelsRender();
    renderToolboxUI();
    renderInspectorUI();
  });
  return editorState;
}

function bindPanelMouse(panelRef, panelIndex) {
  const canvas = panelRef.canvas;
  if (!canvas) return;
  const onMove = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const offsetX = (ev.clientX - rect.left) * dpr;
    const offsetY = (ev.clientY - rect.top) * dpr;
    const sheetsSel = overlayState.panelSheets[panelIndex] || new Set(getSheetsSafe().map(s=>s.name));
    const embedding = circuit?.embedding || { type: 'PLANE' };
    const getPanelXY = (q) => {
      const qq = circuit.qubits?.get?.(q);
      let x = qq?.panelX, y = qq?.panelY;
      if (embedding && embedding.type === 'TORUS') {
        const mod = (v,L)=>((v%L)+L)%L;
        x = mod(x, embedding.Lx);
        y = mod(y, embedding.Ly);
      }
      return [x,y];
    };
    const hit = hitTestAt({
      canvas,
      offsetX,
      offsetY,
      panelZoom,
      snap: editorState?.obs_val_draw_state.get(),
      visibleSheets: sheetsSel,
      embedding,
      getPanelXY,
      torusSegmentsBetween: (p1,p2,Lx,Ly)=>torusSegmentsBetween(p1,p2,Lx,Ly),
      altOnly: ev.altKey === true,
    });
    if (gatePlacement.isActive() || edgePlacement.isActive() || polyPlacement.isActive()) {
      // Determine phantom lattice point near cursor when not over a qubit
      let phantom = null;
      let overQubitHit = null;
      try {
        // Derive snapped panel coords under cursor
        const dprNow = Math.max(1, window.devicePixelRatio || 1);
        const drawX = (offsetX / dprNow) / Math.max(0.1, panelZoom);
        const drawY = (offsetY / dprNow) / Math.max(0.1, panelZoom);
        const pos = xyToPos(drawX * 2 + OFFSET_X, drawY * 2 + OFFSET_Y) || [];
        const gx = pos[0], gy = pos[1];
        // If a qubit exists exactly at the snapped coords, prefer it over non-qubit hits (pass-through gates/edges/polys)
        if (gx !== undefined && gy !== undefined) {
          try {
            for (const [id, q] of circuit.qubits.entries()) {
              if (q && q.panelX === gx && q.panelY === gy) { overQubitHit = { kind: 'qubit', id: `q:${id}` }; break; }
            }
          } catch {}
        }
        if (!hit && !overQubitHit) {
          const dprNow = Math.max(1, window.devicePixelRatio || 1);
          const drawX = (offsetX / dprNow) / Math.max(0.1, panelZoom);
          const drawY = (offsetY / dprNow) / Math.max(0.1, panelZoom);
          // Use draw coords with x2 scaling and negative half-offset correction
          const pos = xyToPos(drawX * 2 + OFFSET_X, drawY * 2 + OFFSET_Y) || [];
          const gx = pos[0], gy = pos[1];
          // Ensure no existing qubit at these panel coords
          let exists = false;
          try {
            for (const [id, q] of circuit.qubits.entries()) {
              if (q && q.panelX === gx && q.panelY === gy) { exists = true; break; }
            }
          } catch {}
          if (!exists) phantom = { x: gx, y: gy };
        }
      } catch {}
      const routedHit = overQubitHit || hit || null;
      if (gatePlacement.isActive()) gatePlacement.onPanelMove(routedHit, phantom);
      if (edgePlacement.isActive()) edgePlacement.onPanelMove(routedHit, phantom);
      if (polyPlacement.isActive()) polyPlacement.onPanelMove(routedHit, phantom);
      // no phantom debug log
      selectionStore.setHover(null);
      try { schedulePanelsRender(); } catch {}
      return;
    }
    if (hit) selectionStore.setHover(hit); else selectionStore.setHover(null);
  };
  const onLeave = () => { selectionStore.setHover(null); try { gatePlacement.onPanelMove(null); } catch {}; try { edgePlacement.onPanelMove(null); } catch {}; try { polyPlacement.onPanelMove(null); } catch {}; try { schedulePanelsRender(); } catch {} };
  const onClick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const offsetX = (ev.clientX - rect.left) * dpr;
    const offsetY = (ev.clientY - rect.top) * dpr;
    const sheetsSel = overlayState.panelSheets[panelIndex] || new Set(getSheetsSafe().map(s=>s.name));
    const embedding = circuit?.embedding || { type: 'PLANE' };
    const getPanelXY = (q) => {
      const qq = circuit.qubits?.get?.(q);
      let x = qq?.panelX, y = qq?.panelY;
      if (embedding && embedding.type === 'TORUS') {
        const mod = (v,L)=>((v%L)+L)%L;
        x = mod(x, embedding.Lx);
        y = mod(y, embedding.Ly);
      }
      return [x,y];
    };
    const hit = hitTestAt({
      canvas,
      offsetX,
      offsetY,
      panelZoom,
      snap: editorState?.obs_val_draw_state.get(),
      visibleSheets: sheetsSel,
      embedding,
      getPanelXY,
      torusSegmentsBetween: (p1,p2,Lx,Ly)=>torusSegmentsBetween(p1,p2,Lx,Ly),
      altOnly: ev.altKey === true,
    });
    if (gatePlacement.isActive() || edgePlacement.isActive() || polyPlacement.isActive()) {
      // Pass-through to qubits when possible
      let routedHit = hit || null;
      try {
        const dprNow = Math.max(1, window.devicePixelRatio || 1);
        const drawX = (offsetX / dprNow) / Math.max(0.1, panelZoom);
        const drawY = (offsetY / dprNow) / Math.max(0.1, panelZoom);
        const pos = xyToPos(drawX * 2 + OFFSET_X, drawY * 2 + OFFSET_Y) || [];
        const gx = pos[0], gy = pos[1];
        if (gx !== undefined && gy !== undefined) {
          for (const [id, q] of circuit.qubits.entries()) {
            if (q && q.panelX === gx && q.panelY === gy) { routedHit = { kind: 'qubit', id: `q:${id}` }; break; }
          }
        }
      } catch {}
      if (gatePlacement.isActive()) { if (gatePlacement.onPanelClick(routedHit)) { try { schedulePanelsRender(); } catch {}; return; } }
      if (edgePlacement.isActive()) { if (edgePlacement.onPanelClick(routedHit)) { try { schedulePanelsRender(); } catch {}; return; } }
      if (polyPlacement.isActive()) { if (polyPlacement.onPanelClick(routedHit)) { try { schedulePanelsRender(); } catch {}; return; } }
    }
    // Click on empty space without multi-select modifiers clears selection.
    if (!hit && !ev.shiftKey && !(ev.ctrlKey || ev.metaKey)) {
      selectionStore.clear();
      for (const p of mgr.panels) { if (p.sel?.setActive) p.sel.setActive('gate'); }
      return;
    }
    const res = selectionStore.applySelection(hit && { kind: hit.kind, id: hit.id }, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey });
    if (res.conflict) {
      // Flash selection widget
      for (const p of mgr.panels) { if (p.sel?.flashError) p.sel.flashError(); }
    } else {
      // Update chip mode display
      for (const p of mgr.panels) { if (p.sel?.setActive) p.sel.setActive(selectionStore.kind || 'gate'); }
    }
  };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('click', onClick);
}

// Emphasize Alt state in the selection widget when holding Alt.
let _altPressed = false;
function setAltPressed(v) {
  if (_altPressed === v) return;
  _altPressed = v;
  for (const p of mgr.panels) { if (p.sel?.setAltActive) p.sel.setAltActive(_altPressed); }
}
window.addEventListener('keydown', (e) => {
  if (e.altKey) setAltPressed(true);
});
window.addEventListener('keyup', (e) => {
  if (!e.altKey) setAltPressed(false);
});
window.addEventListener('blur', () => setAltPressed(false));

function reconcileSelectionVisibility() {
  if (!circuit) return;
  const snap = editorState?.obs_val_draw_state.get();
  if (!snap) return;
  const embedding = circuit?.embedding || { type: 'PLANE' };
  const sel = selectionStore.snapshot();
  if (!sel.kind || sel.selected.size === 0) return;

  // Build per-panel sheet sets.
  const panelSheets = mgr.panels.map((_, i) => overlayState.panelSheets[i] || new Set(getSheetsSafe().map(s => s.name)));

  // Helper: does connection edge exist up to current layer?
  const connExists = (q1, q2) => {
    for (let r = 0; r <= snap.curLayer && r < circuit.layers.length; r++) {
      const anns = circuit.layers[r].annotations || [];
      for (const a of anns) {
        if (!a || a.kind !== 'ConnSet') continue;
        const edges = Array.isArray(a.edges) ? a.edges : [];
        for (const e of edges) {
          if (!Array.isArray(e) || e.length !== 2) continue;
          let [x, y] = e.map(v => parseInt(v));
          const a1 = Math.min(x, y);
          const a2 = Math.max(x, y);
          if (a1 === Math.min(q1,q2) && a2 === Math.max(q1,q2)) return true;
        }
      }
    }
    return false;
  };

  // Latest polygon layer index up to curLayer.
  let lastPolyLayer = -1;
  for (let r = 0; r <= snap.curLayer && r < circuit.layers.length; r++) {
    const anns = circuit.layers[r].annotations || [];
    if (anns.some(a => a && a.kind === 'Polygon')) lastPolyLayer = r;
  }

  const keep = new Set();
  for (const id of sel.selected) {
    const tokens = id.split(':');
    const kind = tokens[0];
    let visibleAnywhere = false;
    try {
      if (kind === 'q' || kind === 'qubit') {
        const q = parseInt(tokens[1]);
        for (let i=0;i<panelSheets.length && !visibleAnywhere;i++) {
          const sheets = panelSheets[i];
          const qmeta = circuit.qubits?.get?.(q);
          const sheet = qmeta?.sheet || 'DEFAULT';
          if (sheets.has(sheet)) visibleAnywhere = true;
        }
      } else if (kind === 'g' || kind === 'gate') {
        const layerIdx = parseInt(tokens[1]);
        const first = parseInt(tokens[2]);
        if (layerIdx === snap.curLayer) {
          const op = circuit.layers?.[layerIdx]?.id_ops?.get?.(first);
          if (op) {
            for (let i=0;i<panelSheets.length && !visibleAnywhere;i++) {
              const sheets = panelSheets[i];
              if (op.id_targets.some(q => sheets.has((circuit.qubits?.get?.(q)?.sheet)||'DEFAULT'))) visibleAnywhere = true;
            }
          }
        }
      } else if (kind === 'c' || kind === 'connection') {
        const sheet = tokens[1];
        const [q1s,q2s] = tokens[2].split('-');
        const q1 = parseInt(q1s), q2 = parseInt(q2s);
        if (connExists(q1,q2)) {
          for (let i=0;i<panelSheets.length && !visibleAnywhere;i++) {
            const sheets = panelSheets[i];
            if (sheets.has(sheet)) visibleAnywhere = true;
          }
        }
      } else if (kind === 'p' || kind === 'polygon') {
        const layerIdx = parseInt(tokens[1]);
        const polyIndex = parseInt(tokens[2]);
        if (lastPolyLayer === layerIdx) {
          const anns = circuit.layers?.[layerIdx]?.annotations || [];
          const poly = anns.find(a => a && a.kind === 'Polygon' && a.polyIndex === polyIndex);
          const psheet = poly?.sheet || 'DEFAULT';
          for (let i=0;i<panelSheets.length && !visibleAnywhere;i++) {
            const sheets = panelSheets[i];
            if (sheets.has(psheet)) visibleAnywhere = true;
          }
        }
      }
    } catch {}
    if (visibleAnywhere) keep.add(id);
  }

  if (keep.size !== sel.selected.size) {
    selectionStore.replace(keep.size > 0 ? sel.kind : null, keep);
    // Update chip mode display
    for (const p of mgr.panels) { if (p.sel?.setActive) p.sel.setActive(selectionStore.kind || 'gate'); }
  }
}
function updateTimelineFocusButton() {
  if (!timelineFocusBtn) return;
  const collapsed = !!timelineCtl.getCollapsed?.();
  const hasFocus = !!(editorState?.timelineSet && editorState.timelineSet.size > 0);
  if (collapsed) {
    timelineFocusBtn.disabled = true;
    timelineFocusBtn.textContent = 'Set Focus';
    return;
  }
  if (hasFocus) {
    timelineFocusBtn.disabled = false;
    timelineFocusBtn.textContent = 'Clear Focus';
  } else {
    // Enable only if there is a selection
    const sel = selectionStore.snapshot?.();
    const hasSel = !!(sel && sel.selected && sel.selected.size > 0);
    timelineFocusBtn.disabled = !hasSel;
    timelineFocusBtn.textContent = 'Set Focus';
  }
}

timelineFocusBtn?.addEventListener('click', () => {
  const collapsed = !!timelineCtl.getCollapsed?.();
  if (collapsed) return;
  if (!editorState) return;
  const hasFocus = !!(editorState.timelineSet && editorState.timelineSet.size > 0);
  if (hasFocus) {
    editorState.clearTimelineFocus();
  } else {
    editorState.setTimelineFocusFromSelection();
  }
  updateTimelineFocusButton();
  schedulePanelsRender();
});

// Keep focus button state in sync with selection changes
selectionStore.subscribe(() => { try { updateTimelineFocusButton(); } catch {} });

// Keyboard finalize/cancel for placements
window.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const tag = (el && el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || (el && el.isContentEditable)) return;
  if (gatePlacement && gatePlacement.isActive()) {
    if (gatePlacement.onKeydown(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  if (edgePlacement && edgePlacement.isActive()) {
    if (edgePlacement.onKeydown(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  if (polyPlacement && polyPlacement.isActive()) {
    if (polyPlacement.onKeydown(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
});

// Minimal interim overlay for partial placement (yellow squares at chosen qubits)
function drawGatePlacementOverlay(ctx, circuit, sheetsSel) {
  if (!gatePlacement || !gatePlacement.isActive()) return;
  const ov = gatePlacement.getOverlay?.();
  if (!ov) return;
  const qmeta = (q)=>circuit.qubits?.get?.(q);
  const vis = (q)=>{ const s=qmeta(q)?.sheet || 'DEFAULT'; return sheetsSel.has(s); };
  const qubitDrawCoords = (q) => [
    circuit.qubitCoordData[2 * q] * pitch - OFFSET_X,
    circuit.qubitCoordData[2 * q + 1] * pitch - OFFSET_Y,
  ];
  const drawFirstGlyphAt = (gateId, q, a=0.5) => {
    if (q == null || !vis(q)) return;
    const [x,y] = qubitDrawCoords(q);
    ctx.save();
    ctx.globalAlpha *= a;
    if (gateId === 'CX' || gateId === 'CY' || gateId === 'CZ') draw_z_control(ctx, x, y);
    else if (gateId === 'XCX' || gateId === 'XCY') draw_x_control(ctx, x, y);
    else if (gateId === 'YCY') draw_y_control(ctx, x, y);
    else if (gateId === 'SWAP') draw_swap_control(ctx, x, y);
    else if (gateId === 'ISWAP' || gateId === 'ISWAP_DAG') draw_iswap_control(ctx, x, y);
    else if (gateId === 'CXSWAP') draw_zswap_control(ctx, x, y);
    else if (gateId === 'CZSWAP') draw_zswap_control(ctx, x, y);
    else if (gateId === 'MXX' || gateId === 'MYY' || gateId === 'MZZ') {
      // simple square with 'M' as interim hint
      ctx.fillStyle = 'gray';
      ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
      ctx.strokeStyle = 'black';
      ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('M', x, y);
    } else {
      // default subtle highlight
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
      ctx.strokeStyle = '#c48f00';
      ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
    }
    ctx.restore();
  };
  const drawMppGlyphAt = (basis, q, a=0.5) => {
    if (q == null || !vis(q)) return;
    const [x,y] = qubitDrawCoords(q);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = 'gray';
    ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
    ctx.strokeStyle = 'black';
    ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px monospace';
    ctx.fillText((basis||'X')[0], x, y - 2);
    ctx.font = '8px monospace';
    ctx.fillText('MPP', x, y + 7);
    ctx.restore();
  };
  if (ov.mode === 'two_second') {
    if (ov.firstQubit != null) drawFirstGlyphAt(ov.gateId, ov.firstQubit, 0.6);
    // Also support phantom firstCoord
    if (ov.firstCoord) {
      const [x,y] = [ov.firstCoord.x * pitch - OFFSET_X, ov.firstCoord.y * pitch - OFFSET_Y];
      ctx.save(); ctx.globalAlpha *= 0.6; draw_z_control(ctx, x, y); ctx.restore();
    }
  } else if (ov.mode === 'multi') {
    const basis = (ov.gateId && ov.gateId.startsWith('MPP:')) ? ov.gateId.substring(4) : 'X';
    for (const q of ov.multiQubits || []) drawMppGlyphAt(basis, q, 0.55);
    // phantom multi coords
    for (const s of ov.multiCoords || []) {
      const [gx,gy] = String(s).split(',').map(parseFloat);
      const [x,y] = [gx * pitch - OFFSET_X, gy * pitch - OFFSET_Y];
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = 'gray';
      ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
      ctx.strokeStyle = 'black';
      ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px monospace'; ctx.fillText((basis||'X')[0], x, y - 2);
      ctx.font = '8px monospace'; ctx.fillText('MPP', x, y + 7);
      ctx.restore();
    }
  }

  // Phantom lattice point hover: faint outlined square
  if (ov.phantom) {
    const [x,y] = [ov.phantom.x * pitch - OFFSET_X, ov.phantom.y * pitch - OFFSET_Y];
    ctx.save();
    ctx.globalAlpha *= 1.0;
    // White fill with faint grey outline
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
    ctx.restore();

    // DEBUG: also draw a strong circle at fixed lattice (10,10) when phantom is active
    // removed debug circle
  }
}

// Edge/Polygon chain overlays
function drawShapePlacementOverlays(ctx, circuit, sheetsSel) {
  const toXY = (p) => {
    if (p.id !== undefined) {
      const q = circuit.qubits?.get?.(p.id);
      if (q) {
        const sheet = q.sheet || 'DEFAULT';
        if (sheetsSel && !sheetsSel.has(sheet)) return null;
        return [q.panelX * pitch - OFFSET_X, q.panelY * pitch - OFFSET_Y];
      }
    }
    if (p.coord) {
      // Assume phantoms/new points will be created on target sheet; draw regardless.
      return [p.coord.x * pitch - OFFSET_X, p.coord.y * pitch - OFFSET_Y];
    }
    return null;
  };

  // Edges: draw from start to current hover/phantom
  if (edgePlacement && edgePlacement.isActive && edgePlacement.isActive()) {
    const ovE = edgePlacement.getOverlay?.();
    if (ovE) {
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      // Draw start point
      if (ovE.startPoint) {
        const sxy = toXY(ovE.startPoint); if (sxy) { ctx.fillRect(sxy[0]-3, sxy[1]-3, 6, 6); ctx.strokeRect(sxy[0]-3, sxy[1]-3, 6, 6); }
      }
      // Draw line toward hover qubit or phantom
      let targetXY = null;
      if (ovE.phantom) targetXY = [ovE.phantom.x * pitch - OFFSET_X, ovE.phantom.y * pitch - OFFSET_Y];
      // If hovering a qubit, prefer that over phantom
      if (!targetXY && ovE.hoverQubit != null) {
        try {
          const q = circuit.qubits?.get?.(ovE.hoverQubit);
          if (q) targetXY = [q.panelX * pitch - OFFSET_X, q.panelY * pitch - OFFSET_Y];
        } catch {}
      }
      if (ovE.startPoint && targetXY) {
        const sxy = toXY(ovE.startPoint);
        if (sxy) { ctx.beginPath(); ctx.moveTo(sxy[0], sxy[1]); ctx.lineTo(targetXY[0], targetXY[1]); ctx.stroke(); }
      }
      // Phantom marker square
      if (ovE.phantom) {
        const [x,y] = [ovE.phantom.x * pitch - OFFSET_X, ovE.phantom.y * pitch - OFFSET_Y];
        ctx.globalAlpha *= 1.0;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
      }
      ctx.restore();
    }
  }

  // Polygons
  if (polyPlacement && polyPlacement.isActive && polyPlacement.isActive()) {
    const ovP = polyPlacement.getOverlay?.();
    if (ovP) {
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      let prev = null;
      for (const p of ovP.points) {
        const xy = toXY(p); if (!xy) continue;
        if (prev) { ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(xy[0], xy[1]); ctx.stroke(); }
        prev = xy;
      }
      for (const p of ovP.points) {
        const xy = toXY(p); if (!xy) continue;
        ctx.fillRect(xy[0]-3, xy[1]-3, 6, 6);
        ctx.strokeRect(xy[0]-3, xy[1]-3, 6, 6);
      }
      if (ovP.phantom) {
        const [x,y] = [ovP.phantom.x * pitch - OFFSET_X, ovP.phantom.y * pitch - OFFSET_Y];
        ctx.globalAlpha *= 1.0;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - rad, y - rad, 2*rad, 2*rad);
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - rad, y - rad, 2*rad, 2*rad);
      }
      ctx.restore();
    }
  }
}

// Flash a gate button in the toolbox briefly (red) on failure.
let flashGateId = null;
let flashTimer = null;
function flashGate(gateId) {
  try { if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; } } catch {}
  flashGateId = gateId;
  try { renderToolboxUI(); } catch {}
  flashTimer = setTimeout(() => { flashGateId = null; try { renderToolboxUI(); } catch {} }, 500);
}

// Update the mouse cursor on panel canvases based on gate placement phase.
function updateGateCursor() {
  try {
    const canvases = mgr.panels.map(p => p.canvas).filter(Boolean);
    if (!gatePlacement?.isActive?.() && !edgePlacement?.isActive?.() && !polyPlacement?.isActive?.()) {
      for (const c of canvases) c.style.cursor = '';
      return;
    }
    // Simple crosshair only
    for (const c of canvases) c.style.cursor = 'crosshair';
  } catch {}
}

// Expose a tiny API for toolbox to add sheets from the palette subpanel.
// Adds a sheet to the current circuit via EditorState and refreshes UI.
// @ts-ignore
window.__addSheet = (name) => {
  try {
    const nm = String(name || '').trim();
    if (!nm) return false;
    const c = editorState ? editorState.copyOfCurAnnotatedCircuit() : (circuit || new AnnotatedCircuit());
    if (c.sheets && c.sheets.has(nm)) { try { pushStatus(`Sheet "${nm}" already exists.`, 'warning'); } catch {}; return false; }
    try { c.sheets.set(nm, new Sheet(nm)); } catch { c.sheets.set(nm, { name: nm }); }
    if (editorState) {
      editorState._pendingDesc = `Add sheet ${nm}`;
      editorState.commit(c);
    } else {
      circuit = c;
    }
    // Refresh overlay sheet lists and panel dropdowns
    try { overlayState.sheets = Array.from(c.sheets.keys()).map(name => ({ name })); } catch {}
    try { renderPanelSheetsOptions(); } catch {}
    try { schedulePanelsRender(); } catch {}
    try { renderToolboxUI(); } catch {}
    try { renderInspectorUI(); } catch {}
    try { pushStatus(`Added sheet "${nm}".`, 'info'); } catch {}
    return true;
  } catch (e) {
    try { pushStatus('Failed to add sheet.', 'error'); } catch {}
    return false;
  }
};
// Interactive gate placement controller
const gatePlacement = new GatePlacementController({
  getCircuit: () => circuit,
  getCurrentLayer: () => currentLayer,
  getEditorState: () => editorState,
  getTargetSheet: () => _targetSheetName,
  pushStatus: (msg, sev) => pushStatus(msg, sev || 'info'),
  onStateChange: () => {
    try { renderToolboxUI(); } catch {}
    try { schedulePanelsRender(); } catch {}
    try { updateGateCursor(); } catch {}
  },
  onFlashGate: (gateId) => { try { flashGate(gateId); } catch {} },
});

// Interactive edge/polygon placement controllers
const edgePlacement = new EdgeChainPlacementController({
  getCircuit: () => circuit,
  getCurrentLayer: () => currentLayer,
  getEditorState: () => editorState,
  getTargetSheet: () => _targetSheetName,
  pushStatus: (msg, sev) => pushStatus(msg, sev || 'info'),
  onStateChange: () => { try { renderToolboxUI(); } catch {} try { schedulePanelsRender(); } catch {} try { updateGateCursor(); } catch {} },
});
const polyPlacement = new PolygonChainPlacementController({
  getCircuit: () => circuit,
  getCurrentLayer: () => currentLayer,
  getEditorState: () => editorState,
  getTargetSheet: () => _targetSheetName,
  pushStatus: (msg, sev) => pushStatus(msg, sev || 'info'),
  onStateChange: () => { try { renderToolboxUI(); } catch {} try { schedulePanelsRender(); } catch {} try { updateGateCursor(); } catch {} },
});
