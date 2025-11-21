import { PropagatedPauliFrames } from '../circuit/propagated_pauli_frames.js';
import { marker_placement } from '../gates/gateset_markers.js';
import { rad } from '../draw/config.js';

function basisColor(basisSet) {
  const set = new Set(basisSet);
  set.delete(undefined);
  set.delete(null);
  if (set.size === 0) return null;
  if (set.size > 1) return '#000000'; // mixed
  const b = [...set][0];
  if (b === 'X') return 'red';
  if (b === 'Y') return 'green';
  if (b === 'Z') return 'blue';
  return '#000000';
}

function rowEl() {
  const row = document.createElement('div');
  row.className = 'marker-row';
  row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 0;';
  const square = document.createElement('canvas');
  square.style.cssText='background:transparent; display:block; width:28px; height:28px;';
  // Compact 3x2 grid container
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid; grid-template-columns: repeat(3, 22px); grid-auto-rows: 18px; gap:0; border:1px solid #c9d1d9; border-radius:6px; overflow:hidden;';
  const mkBtn = (t) => { const b=document.createElement('button'); b.textContent=t; b.className='btn'; b.style.cssText='width:22px;height:18px;padding:0;border:0;background:#fff;font-size:10px;line-height:18px;text-align:center;cursor:pointer;'; return b; };
  const btnCl = mkBtn('Cl');
  const btnO = mkBtn('O');
  const btnD = mkBtn('D');
  const btnX = mkBtn('X');
  const btnY = mkBtn('Y');
  const btnZ = mkBtn('Z');
  // Basis button colors
  btnX.style.background = 'red'; btnX.style.color = '#fff';
  btnY.style.background = 'green'; btnY.style.color = '#fff';
  btnZ.style.background = 'blue'; btnZ.style.color = '#fff';
  const cells = [btnCl, btnO, btnD, btnX, btnY, btnZ];
  cells.forEach((b, idx) => {
    const col = idx % 3; const rowi = Math.floor(idx / 3);
    if (col < 2) b.style.borderRight = '1px solid #e5e7eb';
    if (rowi < 1) b.style.borderBottom = '1px solid #e5e7eb';
    grid.appendChild(b);
  });
  row.append(square, grid);
  return { row, square, btnCl, btnO, btnD, btnX, btnY, btnZ };
}

export function renderMarkers({ containerEl, circuit, currentLayer, propagated, canToggle, onClearIndex, onToggleType }) {
  if (!containerEl) return;
  containerEl.innerHTML='';
  for (let i=0;i<10;i++) {
    const { row, square, btnCl, btnO, btnD, btnX, btnY, btnZ } = rowEl();
    containerEl.appendChild(row);
    // No second row; controls are in the compact grid

    try {
      const p = propagated?.get?.(i) || PropagatedPauliFrames.fromCircuit(circuit, i);
      const currentBasesMap = p.atLayer(currentLayer + 0.5).bases;
      const basisSet = [...currentBasesMap.values()];
      const color = basisColor(basisSet);
      // Has support anywhere in circuit (any layer half-step has bases)
      let hasSupportAny = false;
      try {
        for (const [k, layer] of p.id_layers.entries()) {
          if (typeof k === 'number' && k % 1 !== 0) { // half-integers hold bases
            if (layer.bases && layer.bases.size > 0) { hasSupportAny = true; break; }
          }
        }
      } catch {}
      // Has error anywhere in circuit (any integer layer with errors)
      let hasErr = false;
      try {
        for (const layer of p.id_layers.values()) { if (layer.errors && layer.errors.size > 0) { hasErr = true; break; } }
      } catch {}
      const active = basisSet.length > 0;

      // HiDPI-aware canvas sizing and draw using CSS-px coordinates.
      const cssW = 28, cssH = 28;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      if (square.width !== Math.floor(cssW * dpr) || square.height !== Math.floor(cssH * dpr)) {
        square.width = Math.floor(cssW * dpr);
        square.height = Math.floor(cssH * dpr);
      }
      const ctx = square.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0, square.width, square.height);
      ctx.scale(dpr, dpr);
      const barH = 4; // height for error bar inside the box (at top)
      const boxSize = Math.floor(Math.min(cssW, cssH) * 0.7);
      const boxX = Math.floor((cssW - boxSize) / 2);
      const boxY = Math.floor((cssH - boxSize) / 2);
      // Box fill always white
      ctx.fillStyle = '#fff';
      ctx.fillRect(boxX, boxY, boxSize, boxSize);
      // Border in black/grey
      ctx.strokeStyle = '#444';
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxSize - 1, boxSize - 1);
      // Error bar inside the box, along the top edge
      if (hasErr) {
        ctx.fillStyle = 'hotpink';
        const innerBar = Math.max(2, barH);
        ctx.fillRect(boxX + 1, boxY + 1, boxSize - 2, innerBar);
      }
      // Marker glyph drawn over the box
      if (active && color) {
        try {
          const cx = boxX + Math.floor(boxSize / 2);
          const cy = boxY + Math.floor(boxSize / 2);
          const { dx, dy, wx, wy } = marker_placement(i);
          ctx.fillStyle = color;
          ctx.fillRect(cx - dx, cy - dy, wx, wy);
        } catch {}
      }
      // Draw index number inside the box
      try {
        const cx = boxX + Math.floor(boxSize / 2);
        const cy = boxY + Math.floor(boxSize / 2);
        ctx.fillStyle = '#222';
        ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i), cx, cy);
      } catch {}

      const enable = active && !hasErr;
      btnD.disabled = !enable; btnO.disabled = !enable;
      btnD.style.opacity = enable ? '1' : '0.5';
      btnO.style.opacity = enable ? '1' : '0.5';
      btnD.title = enable ? 'Convert to DETECTOR (TODO)' : 'Unavailable';
      btnO.title = enable ? 'Convert to OBSERVABLE (TODO)' : 'Unavailable';
      // Clear enabled only when there is any support anywhere
      btnCl.disabled = !hasSupportAny;
      btnCl.style.opacity = hasSupportAny ? '1' : '0.5';
      btnCl.onclick = () => hasSupportAny && onClearIndex?.(i);
      const toggleEnabled = !!canToggle;
      btnX.disabled = !toggleEnabled; btnY.disabled = !toggleEnabled; btnZ.disabled = !toggleEnabled;
      const dim = toggleEnabled ? '1' : '0.5';
      btnX.style.opacity = dim; btnY.style.opacity = dim; btnZ.style.opacity = dim;
      if (toggleEnabled) {
        btnX.onclick = () => onToggleType?.('MARKX', i);
        btnY.onclick = () => onToggleType?.('MARKY', i);
        btnZ.onclick = () => onToggleType?.('MARKZ', i);
      } else {
        btnX.onclick = btnY.onclick = btnZ.onclick = null;
      }

    } catch (_) {
      // empty row
      const cssW2 = 28, cssH2 = 28;
      const dpr2 = Math.max(1, window.devicePixelRatio || 1);
      if (square.width !== Math.floor(cssW2 * dpr2) || square.height !== Math.floor(cssH2 * dpr2)) {
        square.width = Math.floor(cssW2 * dpr2);
        square.height = Math.floor(cssH2 * dpr2);
      }
      const ctx = square.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0, square.width, square.height);
      ctx.scale(dpr2, dpr2);
      ctx.strokeStyle = '#ddd';
      ctx.strokeRect(0.5,0.5, cssW2-1, cssH2-1);
      btnD.disabled = true; btnD.style.opacity='0.5';
      btnO.disabled = true; btnO.style.opacity='0.5';
      // When compute fails, disable clear
      btnCl.disabled = true;
      btnCl.style.opacity = '0.5';
      btnCl.onclick = null;
      const toggleEnabled = !!canToggle;
      btnX.disabled = !toggleEnabled; btnY.disabled = !toggleEnabled; btnZ.disabled = !toggleEnabled;
      const dim2 = toggleEnabled ? '1' : '0.5';
      btnX.style.opacity = dim2; btnY.style.opacity = dim2; btnZ.style.opacity = dim2;
      if (toggleEnabled) {
        btnX.onclick = () => onToggleType?.('MARKX', i);
        btnY.onclick = () => onToggleType?.('MARKY', i);
        btnZ.onclick = () => onToggleType?.('MARKZ', i);
      } else {
        btnX.onclick = btnY.onclick = btnZ.onclick = null;
      }
    }
  }
}
