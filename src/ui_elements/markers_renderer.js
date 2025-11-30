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
  // Softer basis button colors (pastel tones)
  btnX.style.background = '#f6b3b3'; btnX.style.color = '#111';
  btnY.style.background = '#b9e6c9'; btnY.style.color = '#111';
  btnZ.style.background = '#bcd7ff'; btnZ.style.color = '#111';
  const cells = [btnCl, btnO, btnD, btnX, btnY, btnZ];
  cells.forEach((b, idx) => {
    const col = idx % 3; const rowi = Math.floor(idx / 3);
    if (col < 2) b.style.borderRight = '1px solid #dee2e6';
    if (rowi < 1) b.style.borderBottom = '1px solid #dee2e6';
    grid.appendChild(b);
  });
  row.append(square, grid);
  return { row, square, btnCl, btnO, btnD, btnX, btnY, btnZ };
}

export function renderMarkers({ containerEl, circuit, currentLayer, propagated, canToggle, onClearIndex, onToggleType }) {
  if (!containerEl) return;
  containerEl.innerHTML='';
  // Center the toolbox contents.
  try {
    containerEl.style.display = 'flex';
    containerEl.style.flexDirection = 'column';
    containerEl.style.alignItems = 'center';
    containerEl.style.gap = '4px';
  } catch {}

  // Collapsible sub-panel for Pauli Marks with arrow toggle (top-right)
  const marksHeader = document.createElement('div');
  marksHeader.style.display = 'flex';
  marksHeader.style.alignItems = 'center';
  marksHeader.style.justifyContent = 'space-between';
  marksHeader.style.width = '100%';
  marksHeader.style.maxWidth = '320px';
  const hdrMarks = document.createElement('div');
  hdrMarks.textContent = 'Pauli Marks';
  hdrMarks.style.fontWeight = '600';
  hdrMarks.style.fontSize = '12px';
  hdrMarks.style.color = 'var(--text)';
  hdrMarks.style.textAlign = 'center';
  hdrMarks.style.flex = '1';
  const marksToggle = document.createElement('button');
  marksToggle.type = 'button';
  marksToggle.textContent = '▾';
  marksToggle.title = 'Show/Hide marks';
  marksToggle.style.border = '0';
  marksToggle.style.background = 'transparent';
  marksToggle.style.cursor = 'pointer';
  marksToggle.style.fontSize = '14px';
  marksHeader.append(document.createElement('span'), hdrMarks, marksToggle);
  containerEl.appendChild(marksHeader);
  const marksContent = document.createElement('div');
  marksContent.style.display = 'flex';
  marksContent.style.flexDirection = 'column';
  marksContent.style.alignItems = 'center';
  marksContent.style.gap = '2px';
  containerEl.appendChild(marksContent);
  for (let i=0;i<10;i++) {
    const { row, square, btnCl, btnO, btnD, btnX, btnY, btnZ } = rowEl();
    // Tighten row vertical padding.
    row.style.padding = '0';
    marksContent.appendChild(row);
    // No second row; controls are in the compact grid

    try {
      const p = propagated?.get?.(i);
      if (!p) throw new Error('No cached propagation');
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
      // Border in black/grey (do not change size when active)
      ctx.lineWidth = 1;
      ctx.strokeStyle = active ? '#000' : '#888';
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
      // Draw index number inside the box (grey when inactive, black when active)
      try {
        const cx = boxX + Math.floor(boxSize / 2);
        const cy = boxY + Math.floor(boxSize / 2);
        ctx.fillStyle = active ? '#000' : '#888';
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
      // empty row: draw same-sized box with grey border to avoid size jumping
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
      const boxSize2 = Math.floor(Math.min(cssW2, cssH2) * 0.7);
      const boxX2 = Math.floor((cssW2 - boxSize2) / 2);
      const boxY2 = Math.floor((cssH2 - boxSize2) / 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(boxX2, boxY2, boxSize2, boxSize2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#888';
      ctx.strokeRect(boxX2 + 0.5, boxY2 + 0.5, boxSize2 - 1, boxSize2 - 1);
      // Always render index number in fallback (inactive → grey)
      try {
        const cx2 = boxX2 + Math.floor(boxSize2 / 2);
        const cy2 = boxY2 + Math.floor(boxSize2 / 2);
        ctx.fillStyle = '#888';
        ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i), cx2, cy2);
      } catch {}
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

  // Spacer then Gates header (placeholder for future gate controls)
  const spacer = document.createElement('div');
  spacer.style.height = '6px';
  containerEl.appendChild(spacer);
  const hdrGates = document.createElement('div');
  hdrGates.textContent = 'Gates';
  hdrGates.style.fontWeight = '600';
  hdrGates.style.fontSize = '12px';
  hdrGates.style.color = 'var(--text)';
  hdrGates.style.textAlign = 'center';
  containerEl.appendChild(hdrGates);
  const gatesContainer = document.createElement('div');
  gatesContainer.style.display = 'flex';
  gatesContainer.style.flexDirection = 'column';
  gatesContainer.style.alignItems = 'center';
  gatesContainer.style.gap = '4px';
  gatesContainer.style.width = '100%';
  containerEl.appendChild(gatesContainer);

  // Gate pillbox rows (columns 1-9 of Crumble toolbox)
  const gateRows = [
    'Hadamard',
    'S',
    'Reset',
    'Measure',
    'Measure Reset',
    'Controlled-Pauli',
    'Controlled-Swap',
    'SC',
    'Measure Pauli Product',
  ];

  // Labels inside each gate cell, taken from stim_crumble/keyboard/toolbox.js (columns 0..8).
  const X_LABELS = ['H_YZ', 'S_X',    'RX', 'MX', 'MRX', 'CX', 'CXSWAP', '√XX', 'M_XX'];
  const Y_LABELS = ['H',    'S_Y',    'RY', 'MY', 'MRY', 'CY', 'SWAP',   '√YY', 'M_YY'];
  const Z_LABELS = ['H_XY', 'S',      'R',  'M',  'MR',  'CZ', 'CZSWAP', '√ZZ', 'M_ZZ'];

  const CELL_SIZE = 20; // CSS px (compact to fit narrow toolbox)

  function drawGateCell(canvas, label) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const css = CELL_SIZE;
    const w = Math.floor(css * dpr), h = Math.floor(css * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = css + 'px';
    canvas.style.height = css + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, w, h);
    ctx.scale(dpr, dpr);
    // Square with darker grey fill like Crumble toolbox
    ctx.fillStyle = '#aaa';
    ctx.fillRect(0.5, 0.5, css - 1, css - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0.5, 0.5, css - 1, css - 1);
    // Label
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = css / 2, cy = css / 2;
    // Font scaling rules
    let scale = 1.0;
    if (label && /SWAP/.test(label)) scale = 0.6;           // Controlled-Swap
    else if (label && /^MR/.test(label)) scale = 0.8;        // Measure Reset
    else if (label && label.startsWith('√')) scale = 0.8;    // SC (sqrt pairs)
    const baseMain = 11 * scale;
    const baseMainSub = 10 * scale;
    const baseSub = 8 * scale;
    const offMain = -3 * scale;
    const offSub = 5 * scale;
    if (label.indexOf('_') !== -1) {
      const [main, sub] = label.split('_');
      ctx.font = `bold ${baseMainSub}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
      ctx.fillText(main, cx, cy + offMain);
      ctx.font = `${baseSub}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
      ctx.fillText(sub, cx, cy + offSub);
    } else {
      ctx.font = `bold ${baseMain}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
      ctx.fillText(label, cx, cy);
    }
  }

  function makePillRow(title, colIndex) {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'space-between';
    wrap.style.width = '100%';
    wrap.style.maxWidth = '320px';
    wrap.style.border = '0';
    wrap.style.borderRadius = '0';
    wrap.style.padding = '0';
    wrap.style.margin = '3px 0';
    wrap.style.background = 'transparent';
    // Allow variable row height for multi-line titles.

    const label = document.createElement('div');
    label.textContent = title;
    label.style.position = 'relative';
    label.style.top = '0';
    label.style.left = '0';
    label.style.fontSize = '10px';
    label.style.color = 'var(--text)';
    // Fix label width to align buttons column; allow wrapping within this width.
    label.style.minWidth = '70px';
    label.style.maxWidth = '70px';
    label.style.whiteSpace = 'normal';
    label.style.overflow = 'visible';
    wrap.appendChild(label);

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '4px';
    // Keep a fixed width so all button columns align.
    btns.style.minWidth = (CELL_SIZE * 3 + 2 * 4) + 'px';
    btns.style.justifyContent = 'flex-end';
    // Create three square cells (X/Y/Z) matching Crumble labels for this column.
    const mkCell = (lbl) => {
      const c = document.createElement('canvas');
      c.style.display = 'block';
      drawGateCell(c, lbl);
      return c;
    };
    btns.append(
      mkCell(X_LABELS[colIndex] || ''),
      mkCell(Y_LABELS[colIndex] || ''),
      mkCell(Z_LABELS[colIndex] || ''),
    );
    wrap.appendChild(btns);
    return wrap;
  }

  gateRows.forEach((t, idx) => {
    gatesContainer.appendChild(makePillRow(t, idx));
  });

  // Wire collapsible marks panel
  let marksCollapsed = false;
  const setMarksCollapsed = (c) => {
    marksCollapsed = !!c;
    marksContent.style.display = marksCollapsed ? 'none' : 'flex';
    marksToggle.textContent = marksCollapsed ? '▸' : '▾';
  };
  marksToggle.addEventListener('click', () => setMarksCollapsed(!marksCollapsed));

}
