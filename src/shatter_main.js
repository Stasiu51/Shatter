import {PanelManager} from './shatter/panel_manager.js';
import {parseStim, stringifyStim, pickAndReadFile, downloadText} from './io/import_export.js';
import {StateSnapshot} from '../stim_crumble/draw/state_snapshot.js';
import {drawTimeline} from '../stim_crumble/draw/timeline_viewer.js';
import {pitch, OFFSET_X, OFFSET_Y} from '../stim_crumble/draw/config.js';
import {PropagatedPauliFrames} from '../stim_crumble/circuit/propagated_pauli_frames.js';

const panelsEl = document.getElementById('panels');
const mgr = new PanelManager(panelsEl);

const seg = document.getElementById('layout-seg');
seg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-layout]');
  if (!btn) return;
  for (const b of seg.querySelectorAll('button')) b.classList.remove('active');
  btn.classList.add('active');
  mgr.setLayout(btn.dataset.layout);
});

// Timeline sizing & collapse
const timeline = document.getElementById('timeline');
const resizer = document.getElementById('timeline-resizer');
const toggle = document.getElementById('timeline-toggle');
const toggleGlobal = document.getElementById('timeline-toggle-global');
const timelineCanvas = document.getElementById('timeline-canvas');
const timelineScroll = document.getElementById('timeline-scroll');
const timelineSpacer = document.getElementById('timeline-spacer');
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

// Load persisted state
const savedCollapsed = localStorage.getItem('timelineCollapsed');
if (savedCollapsed === '1') {
  timeline.classList.add('collapsed');
}
const savedWidth = localStorage.getItem('timelineWidth');
if (savedWidth && !timeline.classList.contains('collapsed')) {
  rootStyle.setProperty('--timeline-width', savedWidth + 'px');
}

let dragging = false;
let startX = 0;
let startW = 0;

// Current circuit (parsed)
let currentCircuit = null;
let currentLayer = 0;
let timelineZoom = parseFloat(localStorage.getItem('timelineZoom') || '1');
if (!(timelineZoom > 0)) timelineZoom = 1;
const clampZoom = (z) => Math.min(3, Math.max(0.5, z));
let currentName = localStorage.getItem('circuitName') || 'circuit';
nameEl.textContent = currentName;
let timelineScrollY = parseFloat(localStorage.getItem('timelineScrollY') || '0');
if (!(timelineScrollY >= 0)) timelineScrollY = 0;
const TIMELINE_PITCH = 32; // must match Crumble timeline_viewer.js

// Compute vertical content height exactly like draw/timeline_viewer.js builds rows.
function computeContentHeightOffscreenPx() {
  if (!currentCircuit) return 0;
  // Gather used qubits and sort by (y, then x) to match the viewer
  const used = currentCircuit.allQubits();
  const qubits = [...used.values()];
  qubits.sort((a, b) => {
    const ax = currentCircuit.qubitCoordData[2 * a];
    const ay = currentCircuit.qubitCoordData[2 * a + 1];
    const bx = currentCircuit.qubitCoordData[2 * b];
    const by = currentCircuit.qubitCoordData[2 * b + 1];
    if (ay !== by) return ay - by;
    return ax - bx;
  });
  let prevY = undefined;
  let curY = 0;
  for (const q of qubits) {
    const y = currentCircuit.qubitCoordData[2 * q + 1];
    curY += TIMELINE_PITCH; // next wire baseline
    if (prevY !== y) {
      prevY = y;
      curY += TIMELINE_PITCH * 0.25; // row separator spacing
    }
  }
  // Add bottom padding for link band and labels; 1 pitch is a safe envelope.
  return Math.max(0, Math.ceil(curY + TIMELINE_PITCH));
}

function computeMaxScrollCSS(viewportCssHeight) {
  if (!currentCircuit) return 0;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const contentOffPx = computeContentHeightOffscreenPx();
  const contentCss = (contentOffPx * timelineZoom) / dpr;
  return Math.max(0, Math.floor(contentCss - viewportCssHeight));
}

function computeContentOffHeight(viewportDevPx) {
  if (!currentCircuit) return viewportDevPx;
  // True offscreen content height based on qubit rows.
  const exact = computeContentHeightOffscreenPx();
  // Ensure at least the viewport height so we always render something.
  return Math.max(viewportDevPx, exact);
}

function setCircuitName(name) {
  let n = String(name || '').trim();
  // Strip .stim or .txt suffixes (case-insensitive).
  n = n.replace(/\.(stim|txt)$/i, '');
  // Remove filesystem-unsafe characters.
  n = n.replace(/[\\/:*?"<>|]/g, '').trim();
  if (!n) n = 'circuit';
  currentName = n;
  nameEl.textContent = currentName;
  localStorage.setItem('circuitName', currentName);
}

// Editable name behavior
nameEl.addEventListener('click', () => {
  // Enter edit mode
  nameEl.contentEditable = 'true';
  nameEl.classList.add('editing');
  // Place caret at end
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

function commitNameEdit() {
  if (nameEl.isContentEditable) {
    setCircuitName(nameEl.textContent);
    nameEl.contentEditable = 'false';
    nameEl.classList.remove('editing');
  }
}

nameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitNameEdit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    nameEl.textContent = currentName;
    commitNameEdit();
  }
});
nameEl.addEventListener('blur', commitNameEdit);

resizer.addEventListener('mousedown', (e) => {
  if (timeline.classList.contains('collapsed')) return;
  dragging = true;
  startX = e.clientX;
  startW = timeline.getBoundingClientRect().width;
  document.body.style.userSelect = 'none';
  timeline.classList.add('resizing');
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - startX;
  const newW = clamp(startW - dx, 200, Math.max(260, Math.floor(window.innerWidth * 0.8)));
  rootStyle.setProperty('--timeline-width', newW + 'px');
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  document.body.style.userSelect = '';
  timeline.classList.remove('resizing');
  const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-width'));
  if (!Number.isNaN(w)) localStorage.setItem('timelineWidth', String(w));
});

function setTimelineCollapsed(collapsed) {
  timeline.classList.toggle('collapsed', collapsed);
  localStorage.setItem('timelineCollapsed', collapsed ? '1' : '0');
  resizer.style.display = collapsed ? 'none' : '';
  const label = collapsed ? 'Show timeline' : 'Hide timeline';
  if (toggleGlobal) toggleGlobal.textContent = label;
}

toggle.addEventListener('click', () => {
  setTimelineCollapsed(!timeline.classList.contains('collapsed'));
});

toggleGlobal.addEventListener('click', () => {
  setTimelineCollapsed(!timeline.classList.contains('collapsed'));
});

// Double-click resizer to reset width
resizer.addEventListener('dblclick', () => {
  rootStyle.setProperty('--timeline-width', '360px');
  localStorage.setItem('timelineWidth', '360');
  renderTimeline();
});

// Apply initial resizer visibility
resizer.style.display = timeline.classList.contains('collapsed') ? 'none' : '';
if (toggleGlobal) toggleGlobal.textContent = timeline.classList.contains('collapsed') ? 'Show timeline' : 'Hide timeline';

// Import/Export handlers
btnImport?.addEventListener('click', async () => {
  const picked = await pickAndReadFile({accept: '.stim,.txt'});
  if (!picked) return;
  try {
    const {circuit, text, warnings} = parseStim(picked.text);
    currentCircuit = circuit;
    currentLayer = 0;
    timelineScrollY = 0;
    renderTimeline();
    updateLayerIndicator();
    if (picked.name) setCircuitName(picked.name);
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

// Status bar & log
const statusLog = [];
function pushStatus(message, level = 'info') {
  const ts = new Date().toISOString();
  const entry = `${ts} [${level.toUpperCase()}] ${message}`;
  statusLog.push(entry);
  // Trim log to a reasonable size
  if (statusLog.length > 1000) statusLog.shift();
  // Update UI
  statusText.textContent = message;
  const colors = { info: '#8b949e', warning: '#c69026', error: '#d1242f' };
  statusDot.style.background = colors[level] || colors.info;

  // Right side shows the most recent warning/error unless the latest message is itself a warning/error.
  if (level === 'warning' || level === 'error') {
    statusTextRight.textContent = '';
    statusDotRight.style.background = colors.info;
  } else {
    // Scan from end for latest warning/error.
    let warnEntry = null;
    for (let i = statusLog.length - 1; i >= 0; i--) {
      const line = statusLog[i];
      if (line.includes('[WARNING]') || line.includes('[ERROR]')) {
        warnEntry = line;
        break;
      }
    }
    if (warnEntry) {
      // Extract message and level from the log line.
      const isErr = warnEntry.includes('[ERROR]');
      const msg = warnEntry.replace(/^.*\]\s*/, '');
      statusTextRight.textContent = msg;
      statusDotRight.style.background = isErr ? colors.error : colors.warning;
    } else {
      statusTextRight.textContent = '';
      statusDotRight.style.background = colors.info;
    }
  }
}

statusEl?.addEventListener('click', () => {
  const content = statusLog.join('\n') + (statusLog.length ? '\n' : '');
  const name = (currentName || 'circuit') + '-status-log.txt';
  downloadText(name, content);
});

// Initial status
pushStatus('Ready.', 'info');

// Timeline rendering
function computePropagated(circuit) {
  const propagated = new Map();
  let numPropagatedLayers = 0;
  for (let layer of circuit.layers) {
    for (let op of layer.markers) {
      const gate = op.gate;
      if (gate.name === 'MARKX' || gate.name === 'MARKY' || gate.name === 'MARKZ') {
        numPropagatedLayers = Math.max(numPropagatedLayers, op.args[0] + 1);
      }
    }
  }
  for (let mi = 0; mi < numPropagatedLayers; mi++) {
    propagated.set(mi, PropagatedPauliFrames.fromCircuit(circuit, mi));
  }
  const {dets, obs} = circuit.collectDetectorsAndObservables(false);
  const batch_input = [];
  for (let mi = 0; mi < dets.length; mi++) {
    batch_input.push(dets[mi].mids);
  }
  for (let mi of obs.keys()) {
    batch_input.push(obs.get(mi));
  }
  const batch_output = PropagatedPauliFrames.batchFromMeasurements(circuit, batch_input);
  let batch_index = 0;
  for (let mi = 0; mi < dets.length; mi++) {
    propagated.set(~mi, batch_output[batch_index++]);
  }
  for (let mi of obs.keys()) {
    propagated.set(~mi ^ (1 << 30), batch_output[batch_index++]);
  }
  return propagated;
}

function renderTimeline() {
  if (!timelineCanvas || !currentCircuit) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = timelineCanvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (timelineCanvas.width !== w || timelineCanvas.height !== h) {
    timelineCanvas.width = w;
    timelineCanvas.height = h;
  }
  const ctx = timelineCanvas.getContext('2d');
  // Draw in device pixels; no transform. We'll render offscreen at double width and blit the right half.
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Minimal snapshot
  const snap = new StateSnapshot(
    currentCircuit,
    Math.max(0, Math.min(currentLayer, currentCircuit.layers.length - 1)),
    new Map(),
    new Map(),
    0, 0, undefined, undefined, []
  );
  const propagated = computePropagated(currentCircuit);
  const c2d = (x, y) => [x * pitch - OFFSET_X, y * pitch - OFFSET_Y];
  const qubitDrawCoords = q => {
    const x = currentCircuit.qubitCoordData[2 * q];
    const y = currentCircuit.qubitCoordData[2 * q + 1];
    return c2d(x, y);
  };
  ctx.clearRect(0, 0, timelineCanvas.width, timelineCanvas.height);

  // Render into an offscreen canvas with double width to satisfy drawTimeline's left/right split.
  const off = document.createElement('canvas');
  // Zoom by adjusting the offscreen canvas size inversely: larger zoom => smaller offscreen area
  off.width = Math.max(2, Math.round((w * 2) / timelineZoom));
  const minOffH = Math.max(2, Math.round(h / timelineZoom));
  // Make the offscreen height large enough for the full content to support smooth scrolling.
  const contentOffPx = computeContentOffHeight(minOffH);
  off.height = Math.max(minOffH, contentOffPx);
  const offCtx = off.getContext('2d');
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, off.width, off.height);
  // Add a small left padding so labels don't sit under the divider.
  // Compute padding in onscreen device pixels, then map into offscreen space by dividing by zoom.
  const leftPadOnscreen = Math.round(12 * (window.devicePixelRatio || 1));
  const leftPadOffscreen = Math.max(0, Math.round(leftPadOnscreen / timelineZoom));
  // Clamp scroll to available content height before drawing
  const rectCssH = timelineCanvas.getBoundingClientRect().height;
  const maxScrollCss = computeMaxScrollCSS(rectCssH);
  if (timelineScrollY > maxScrollCss) {
    timelineScrollY = maxScrollCss;
    localStorage.setItem('timelineScrollY', String(timelineScrollY));
  }
  const scrollDev = Math.round((timelineScrollY || 0) * (window.devicePixelRatio || 1));
  const scrollOff = Math.round(scrollDev / timelineZoom);
  offCtx.translate(leftPadOffscreen, -scrollOff);
  drawTimeline(offCtx, snap, propagated, qubitDrawCoords, currentCircuit.layers.length);

  // Blit the right half into the onscreen canvas at full size.
  ctx.drawImage(off, off.width / 2, 0, off.width / 2, off.height, 0, 0, timelineCanvas.width, timelineCanvas.height);
  updateLayerIndicator();
}

window.addEventListener('resize', renderTimeline);
// Render while dragging to keep visuals crisp.
window.addEventListener('mousemove', () => { if (dragging) renderTimeline(); });

// Zoom controls
function setZoom(z) {
  timelineZoom = clampZoom(z);
  localStorage.setItem('timelineZoom', String(timelineZoom));
  if (!timeline.classList.contains('collapsed')) renderTimeline();
}
zoomInBtn?.addEventListener('click', () => setZoom(timelineZoom * 1.25));
zoomOutBtn?.addEventListener('click', () => setZoom(timelineZoom / 1.25));
zoomResetBtn?.addEventListener('click', () => setZoom(1));

// Vertical scrolling (wheel/trackpad) on the timeline canvas
timelineCanvas?.addEventListener('wheel', (e) => {
  if (!currentCircuit) return;
  e.preventDefault();
  const mode = e.deltaMode; // 0: pixels, 1: lines, 2: pages
  let dy = e.deltaY;
  if (mode === 1) dy *= 16;
  else if (mode === 2) dy *= window.innerHeight;
  const rectCssH = timelineCanvas.getBoundingClientRect().height;
  const maxScrollCss = computeMaxScrollCSS(rectCssH);
  timelineScrollY = Math.max(0, Math.min(maxScrollCss, timelineScrollY + dy));
  localStorage.setItem('timelineScrollY', String(timelineScrollY));
  if (!timeline.classList.contains('collapsed')) renderTimeline();
}, {passive: false});

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
  if (!timeline.classList.contains('collapsed')) renderTimeline();
  updateLayerIndicator();
}

function isEditing() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.isContentEditable) return true;
  return false;
}

window.addEventListener('keydown', (e) => {
  if (isEditing()) return;
  const k = e.key?.toLowerCase();
  if (k === 'q' || k === 'e') {
    e.preventDefault();
    const delta = (e.shiftKey ? 5 : 1) * (k === 'q' ? -1 : 1);
    setLayer(currentLayer + delta);
  } else if (k === 'arrowleft' || k === 'arrowright') {
    e.preventDefault();
    const delta = (e.shiftKey ? 5 : 1) * (k === 'arrowleft' ? -1 : 1);
    setLayer(currentLayer + delta);
  }
});
