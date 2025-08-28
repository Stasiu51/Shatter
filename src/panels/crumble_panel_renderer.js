import {StateSnapshot} from '../../stim_crumble/draw/state_snapshot.js';
import {draw} from '../../stim_crumble/draw/main_draw.js';

export function computeCanvasSize(rect, dpr) {
  const w = Math.max(1, Math.floor(rect.width * Math.max(1, dpr || 1)));
  const h = Math.max(1, Math.floor(rect.height * Math.max(1, dpr || 1)));
  return {w, h};
}

export function renderPanel({canvas, circuit, currentLayer, panelZoom = 1}) {
  if (!canvas || !circuit) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const {w, h} = computeCanvasSize(rect, dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Offscreen at double width to satisfy Crumble's left/right split.
  const off = document.createElement('canvas');
  const srcW = Math.max(2, Math.ceil(w / Math.max(0.1, panelZoom)));
  const srcH = Math.max(2, Math.ceil(h / Math.max(0.1, panelZoom)));
  off.width = Math.max(2, srcW * 2);
  off.height = Math.max(2, srcH);
  const offCtx = off.getContext('2d');
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, off.width, off.height);

  const snap = new StateSnapshot(
    circuit,
    Math.max(0, Math.min(currentLayer|0, circuit.layers.length - 1)),
    new Map(),
    new Map(),
    0, 0, undefined, undefined, []
  );
  draw(offCtx, snap);

  // Blit a portion of the left half into the panel canvas at the requested zoom.
  const sx = 0;
  const sy = 0;
  const sWidth = Math.min(srcW, off.width / 2);
  const sHeight = Math.min(srcH, off.height);
  ctx.drawImage(off, sx, sy, sWidth, sHeight, 0, 0, w, h);}

