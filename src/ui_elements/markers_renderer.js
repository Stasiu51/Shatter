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
  row.style.cssText = 'display:flex; align-items:center; gap:8px;';
  const square = document.createElement('canvas');
  square.width = 28; square.height = 28; square.style.cssText='background:transparent; display:block;';
  const btnD = document.createElement('button'); btnD.textContent='D'; btnD.className='btn'; btnD.style.cssText='padding:2px 6px;';
  const btnO = document.createElement('button'); btnO.textContent='O'; btnO.className='btn'; btnO.style.cssText='padding:2px 6px;';
  const label = document.createElement('span'); label.style.cssText='min-width:24px; color:#57606a;';
  row.append(label, square, btnD, btnO);
  return { row, square, btnD, btnO, label };
}

export function renderMarkers({ containerEl, circuit, currentLayer, canToggle, onClearIndex, onToggleType }) {
  if (!containerEl) return;
  containerEl.innerHTML='';
  for (let i=0;i<10;i++) {
    const { row, square, btnD, btnO, label } = rowEl();
    label.textContent = `#${i}`;
    // Insert a 'Cl' clear button between square and D
    const btnCl = document.createElement('button'); btnCl.textContent='Cl'; btnCl.className='btn'; btnCl.style.cssText='padding:2px 6px;';
    row.insertBefore(btnCl, btnD);
    containerEl.appendChild(row);

    // Add a second row for X/Y/Z buttons
    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex; align-items:center; gap:6px; padding-left:24px;';
    const mkBtn = (t, color) => { const b=document.createElement('button'); b.textContent=t; b.className='btn'; b.style.cssText=`padding:2px 6px; background:${color}; color:#fff; border-color:${color}`; return b; };
    const btnX = mkBtn('X', 'red');
    const btnY = mkBtn('Y', 'green');
    const btnZ = mkBtn('Z', 'blue');
    row2.append(btnX, btnY, btnZ);
    containerEl.appendChild(row2);

    try {
      const p = PropagatedPauliFrames.fromCircuit(circuit, i);
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

      // Draw square: smaller box (70%), white fill, dark outline.
      const ctx = square.getContext('2d');
      ctx.clearRect(0,0, square.width, square.height);
      const barH = 4; // height for error bar inside the box (at top)
      const boxSize = Math.floor(Math.min(square.width, square.height) * 0.7);
      const boxX = Math.floor((square.width - boxSize) / 2);
      const boxY = Math.floor((square.height - boxSize) / 2);
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

      const enable = active && !hasErr;
      btnD.disabled = !enable;
      btnO.disabled = !enable;
      if (btnD.disabled) { btnD.style.opacity='0.5'; } else { btnD.style.opacity='1'; }
      if (btnO.disabled) { btnO.style.opacity='0.5'; } else { btnO.style.opacity='1'; }
      btnD.title = enable ? 'Convert to DETECTOR (TODO)' : 'Unavailable';
      btnO.title = enable ? 'Convert to OBSERVABLE (TODO)' : 'Unavailable';
      // Clear enabled only when there is any support anywhere
      btnCl.disabled = !hasSupportAny;
      btnCl.style.opacity = hasSupportAny ? '1' : '0.5';
      btnCl.onclick = () => hasSupportAny && onClearIndex?.(i);
      const toggleEnabled = !!canToggle;
      btnX.disabled = !toggleEnabled; btnY.disabled = !toggleEnabled; btnZ.disabled = !toggleEnabled;
      btnX.style.opacity = toggleEnabled ? '1' : '0.5';
      btnY.style.opacity = toggleEnabled ? '1' : '0.5';
      btnZ.style.opacity = toggleEnabled ? '1' : '0.5';
      if (toggleEnabled) {
        btnX.onclick = () => onToggleType?.('MARKX', i);
        btnY.onclick = () => onToggleType?.('MARKY', i);
        btnZ.onclick = () => onToggleType?.('MARKZ', i);
      } else {
        btnX.onclick = btnY.onclick = btnZ.onclick = null;
      }

    } catch (_) {
      // empty row
      const ctx = square.getContext('2d');
      ctx.clearRect(0,0, square.width, square.height);
      ctx.strokeStyle = '#ddd';
      ctx.strokeRect(0.5,0.5, square.width-1, square.height-1);
      btnD.disabled = true; btnD.style.opacity='0.5';
      btnO.disabled = true; btnO.style.opacity='0.5';
      // When we can't compute support, be conservative: allow clear only if we detect any basis in current layer
      const allowClear = basisSet.length > 0;
      btnCl.disabled = !allowClear;
      btnCl.style.opacity = allowClear ? '1' : '0.5';
      btnCl.onclick = () => allowClear && onClearIndex?.(i);
      const toggleEnabled = !!canToggle;
      btnX.disabled = !toggleEnabled; btnY.disabled = !toggleEnabled; btnZ.disabled = !toggleEnabled;
      btnX.style.opacity = toggleEnabled ? '1' : '0.5';
      btnY.style.opacity = toggleEnabled ? '1' : '0.5';
      btnZ.style.opacity = toggleEnabled ? '1' : '0.5';
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
