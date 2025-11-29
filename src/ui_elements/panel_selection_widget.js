import {GATE_MAP} from '../gates/gateset.js';
import {Operation} from '../circuit/operation.js';
import {rad} from '../draw/config.js';

export function createSelectionWidget() {
  const root = document.createElement('div');
  root.className = 'sel-widget';

  const row = document.createElement('div');
  row.className = 'sel-row';

  const gate = box('gate', 'Gate');
  const group = document.createElement('div');
  group.className = 'sel-group';
  const qubit = box('qubit', 'Qubit');
  const conn = box('conn', 'Conn');
  const poly = box('poly', 'Poly');
  const alt = document.createElement('div');
  alt.className = 'sel-alt';
  alt.textContent = 'Alt';
  const svgNS = 'http://www.w3.org/2000/svg';
  const brace = document.createElementNS(svgNS, 'svg');
  brace.setAttribute('class', 'sel-brace');
  brace.setAttribute('viewBox', '0 0 100 12');
  brace.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(svgNS, 'path');
  // Curly under-brace shape: down-left hook, horizontal (shortened), up-right hook.
  path.setAttribute('d', 'M2,0 v6 c0,2 2,2 6,2 h40 c4,0 6,0 6,-2 v-6');
  brace.appendChild(path);

  // Default mode is Gate.
  gate.classList.add('active');

  // Draw tiny icons into the boxes.
  try {
    drawGateIcon(gate);
    drawQubitIcon(qubit);
    drawConnIcon(conn);
    drawPolyIcon(poly);
  } catch {}

  group.append(qubit, conn, poly, alt, brace);
  row.append(gate, group);
  root.append(row);

  // Expose minimal API for flashing red on invalid multi-select later.
  root.flashError = () => {
    root.classList.add('flash');
    setTimeout(() => root.classList.remove('flash'), 500);
  };
  root.setActive = (kind) => {
    for (const child of [gate, qubit, conn, poly]) child.classList.remove('active');
    if (kind === 'gate') gate.classList.add('active');
    else if (kind === 'qubit') qubit.classList.add('active');
    else if (kind === 'connection') conn.classList.add('active');
    else if (kind === 'polygon') poly.classList.add('active');
  };

  root.setAltActive = (active) => {
    if (active) root.classList.add('alt-active');
    else root.classList.remove('alt-active');
  };

  return root;
}

function box(cls, title) {
  const el = document.createElement('div');
  el.className = `sel-box ${cls}`;
  el.title = title;
  return el;
}

function makeCanvasFor(el) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = 16, h = 16; // CSS size
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  el.appendChild(c);
  const ctx = c.getContext('2d');
  // Identity transform; we work in device pixels and compute center explicitly.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {canvas: c, ctx, dpr, cssW: w, cssH: h, devW: c.width, devH: c.height};
}

function centerScale(ctx, devW, devH, pad = 1.0, rel = 1.0) {
  // Scale drawing so 2*rad fits within devW/H with padding and rel factor, then return scale.
  const need = 2 * rad * pad;
  const s = (Math.min(devW, devH) / Math.max(1, need)) * rel;
  ctx.scale(s, s);
  return s;
}

// Hardcoded pixel offsets (left/up) to nudge icons for better centering.
const ICON_OFFSETS = {
  gate:  { dx: 2, dy: 2 },
  qubit: { dx: 2, dy: 2 },
  poly:  { dx: 1, dy: 1 },
};
function getOffsets(kind) {
  const o = ICON_OFFSETS[kind] || {};
  return { dx: o.dx || 0, dy: o.dy || 0 };
}

function drawGateIcon(el) {
  const {ctx, devW, devH} = makeCanvasFor(el);
  ctx.clearRect(0, 0, devW, devH);
  const scale = centerScale(ctx, devW, devH, 1.3, 0.8);
  let cx = (devW / scale) / 2;
  let cy = (devH / scale) / 2;
  // Apply CSS pixel offsets (convert to scaled units). dy is up; dx is left.
  const {dx, dy} = getOffsets('gate');
  cx -= dx / scale;
  cy -= dy / scale;
  // Build a one-qubit X gate and draw it at center (cx,cy).
  const gate = GATE_MAP.get('X');
  if (!gate) return;
  const op = new Operation(gate, '', new Float32Array([]), new Uint32Array([0]), -1);
  const coordFunc = () => [cx, cy];
  op.id_draw(coordFunc, ctx);
  // Darker grey shading over the square, then redraw the X fully black on top.
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(cx - rad, cy - rad, 2 * rad, 2 * rad);
  ctx.restore();
  // Redraw the X glyph fully black above the shading.
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', cx, cy);
  ctx.restore();
}

function drawQubitIcon(el) {
  const {ctx, devW, devH} = makeCanvasFor(el);
  ctx.clearRect(0, 0, devW, devH);
  const scale = centerScale(ctx, devW, devH, 1.3, 0.8);
  let cx = (devW / scale) / 2;
  let cy = (devH / scale) / 2;
  const {dx, dy} = getOffsets('qubit');
  cx -= dx / scale;
  cy -= dy / scale;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.fillRect(cx - rad, cy - rad, 2 * rad, 2 * rad);
  ctx.strokeRect(cx - rad, cy - rad, 2 * rad, 2 * rad);
}

function drawPolyIcon(el) {
  const {ctx, devW, devH} = makeCanvasFor(el);
  ctx.clearRect(0, 0, devW, devH);
  const scale = centerScale(ctx, devW, devH, 1.3, 0.8);
  let cx = (devW / scale) / 2;
  let cy = (devH / scale) / 2;
  const {dx, dy} = getOffsets('poly');
  cx -= dx / scale;
  cy -= dy / scale;
  const R = rad * 0.9;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 6;
    const x = cx + R * Math.cos(a);
    const y = cy + R * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#e64a4a';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Tweakable parameters for the connection icon (line).
const LINE_TWEAKS = {
  dx: -1,           // pixels right (use negative for left)
  dy: -1,           // pixels down (use negative for up)
  lengthFrac: 0.7, // fraction of min(box width,height), total length
  angleDeg: -45,   // angle in degrees (0=right, -45=diag up-right)
  thickness: 1.5,  // stroke width in CSS pixels
};
function drawConnIcon(el) {
  const {ctx, dpr, devW, devH} = makeCanvasFor(el);
  ctx.clearRect(0, 0, devW, devH);
  const cx = devW / 2 + (LINE_TWEAKS.dx * dpr);
  const cy = devH / 2 + (LINE_TWEAKS.dy * dpr);
  const totalLen = Math.min(devW, devH) * Math.max(0, Math.min(1, LINE_TWEAKS.lengthFrac));
  const half = totalLen / 2;
  const a = (LINE_TWEAKS.angleDeg || 0) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const x1 = cx - half * ux, y1 = cy - half * uy;
  const x2 = cx + half * ux, y2 = cy + half * uy;
  ctx.strokeStyle = '#1e90ff';
  ctx.lineWidth = Math.max(1, LINE_TWEAKS.thickness * dpr / 1.5);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
