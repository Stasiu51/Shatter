import { PanelManager } from './ui_elements/panel_manager.js';
import { parseStim, stringifyStim, pickAndReadFile, downloadText } from './io/import_export.js';
import { AnnotatedCircuit } from './circuit/annotated_circuit.js';
import { renderTimeline as renderTimelineCore, computeMaxScrollCSS } from './ui_elements/timeline_renderer.js';
import { drawPanel } from './draw/draw_panel.js'
import { torusSegmentsBetween } from './draw/draw_panel.js'
import { setupTimelineUI } from './ui_elements/timeline_controller.js';
import { createStatusLogger } from './ui_elements/status_logger.js';
import { setupNameEditor, sanitizeName } from './ui_elements/name_editor.js';
import { setupLayerKeyboard } from './layers/keyboard.js';
import { createSheetsDropdown } from './ui_elements/sheets_dropdown.js';
import { setupTextEditorUI } from './ui_elements/text_editor_controller.js';
import { EditorState } from './editor/editor_state.js';
import { selectionStore } from './editor/selection_store.js';
import { hitTestAt } from './draw/hit_test.js';

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

// (Inspector pane removed)

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
    }

    // Init or update EditorState (source of interactive edits ⇒ text). Start fresh baseline.
    ensureEditorState();
    editorState.rev.clear(currentText);

    // Reset timeline scroll; rendering will occur via snapshot subscription.
    timelineCtl.setScrollY(0);
    // Update sheet list for dropdowns from the parsed circuit.
    try {
      if (circuit?.sheets && typeof circuit.sheets.size === 'number') {
        overlayState.sheets = Array.from(circuit.sheets.keys()).map(name => ({ name }));
      } else {
        overlayState.sheets = DEFAULT_SHEETS;
      }
      renderPanelSheetsOptions();
      schedulePanelsRender();
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


/** Update timeline layer indicator text. */
function updateLayerIndicator() {
  const el = document.getElementById('timeline-layer-info');
  if (!el) return;
  if (!circuit) {
    el.textContent = '';
    return;
  }
  const last = Math.max(0, circuit.layers.length - 1);
  el.textContent = `Layer ${currentLayer}/${last}. Use Q/E to move.`;
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
  getMaxLayer: () => Math.max(0, (circuit?.layers?.length || 1) - 1),
});

/** Render all panels. */
function renderAllPanels() {
  if (!circuit) return;
  const snap = editorState ? editorState.obs_val_draw_state.get() : null;
  if (!snap) return;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
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
      drawPanel(ctx, snap, sheetsSel);
      ctx.restore();
    } else {
      drawPanel(ctx, snap, sheetsSel);
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

function ensureEditorState() {
  if (editorState) return editorState;
  // Prefer first panel canvas; fallback to a throwaway canvas.
  const canvas = mgr.panels?.[0]?.canvas || document.createElement('canvas');
  editorState = new EditorState(canvas);
  // Subscribe to revision changes: when a commit occurs, adopt the new text.
  editorState.rev.changes().subscribe((maybeText) => {
    // Update source text and keep parsed circuit in sync when provided.
    // loadStimText(maybeText);
    // if (typeof maybeText === 'string') {

      // currentText = maybeText;
      // try {
      //   const parsed = AnnotatedCircuit.parse(currentText);
      //   circuit = parsed?.circuit || null;
      //   currentText = parsed?.text ?? currentText;
      //   if (editorTextareaEl) {
      //     editorTextareaEl.value = currentText;
      //     setEditorDirty(false);
      //   }
      // } catch (e) {
      //   pushStatus(`Parse error: ${e?.message || e}`, 'error');
      // }
    // }
    // Trigger a fresh snapshot; downstream subscriptions will render.
    editorState.obs_val_draw_state.set(editorState.toSnapshot(undefined));
  });
  // Draw panels on snapshot changes, mirroring stim_crumble's render loop.
  editorState.obs_val_draw_state.observable().subscribe(ds => {
    requestAnimationFrame(() => {
      renderAllPanels(ds);
      timelineCtl.render();
    });
  });
  // Redraw panels on selection changes
  selectionStore.subscribe(() => schedulePanelsRender());
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
    if (hit) selectionStore.setHover(hit); else selectionStore.setHover(null);
  };
  const onLeave = () => selectionStore.setHover(null);
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
        const targetsStr = tokens[2];
        const ids = targetsStr.split('-').map(s=>parseInt(s));
        if (lastPolyLayer === layerIdx) {
          const anns = circuit.layers?.[layerIdx]?.annotations || [];
          const poly = anns.find(a => a && a.kind === 'Polygon' && Array.isArray(a.targets) && a.targets.length === ids.length && a.targets.every((q, idx)=>q===ids[idx]));
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
