import {pitch, rad, OFFSET_X, OFFSET_Y} from './config.js';

/** Distance from point to segment */
function distToSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const c1 = vx*wx + vy*wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx*vx + vy*vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const t = c1 / c2;
  const projx = x1 + t*vx, projy = y1 + t*vy;
  return Math.hypot(px - projx, py - projy);
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {number} opts.offsetX // device px
 * @param {number} opts.offsetY // device px
 * @param {number} opts.panelZoom
 * @param {import('../editor/editor_state.js').default|any} opts.snap // StateSnapshot
 * @param {Set<string>} opts.visibleSheets
 * @param {{type:'PLANE'|'TORUS', Lx?:number, Ly?:number}} opts.embedding
 * @param {function(any):[number,number]} opts.getPanelXY // q -> [x,y] panel-space
 * @param {function([number,number],[number,number],number,number):Array} opts.torusSegmentsBetween
 * @param {boolean} opts.altOnly // if true, exclude gates from candidates
 */
export function hitTestAt(opts) {
  const { canvas, offsetX, offsetY, panelZoom, snap, visibleSheets, embedding, getPanelXY, torusSegmentsBetween, altOnly } = opts;
  if (!snap || !snap.circuit) return null;
  const circuit = snap.circuit;
  const contentX = offsetX / Math.max(0.001, panelZoom);
  const contentY = offsetY / Math.max(0.001, panelZoom);
  const c2d = (x, y) => [x * pitch - OFFSET_X, y * pitch - OFFSET_Y];
  const qubitDrawCoords = (q) => c2d(...getPanelXY(q));
  const isQubitVisible = (qid) => {
    const q = circuit.qubits?.get?.(qid);
    const sheet = q?.sheet ?? 'DEFAULT';
    return visibleSheets.has(sheet);
  };

  const candidates = [];

  // Gates (skip when Alt held)
  if (!altOnly) {
    const layer = circuit.layers[snap.curLayer];
    if (layer) {
      for (const op of layer.iter_gates_and_markers()) {
        if (!op?.gate || op.gate.name === 'POLYGON') continue;
        // visible if any target qubit visible
        if (!op.id_targets.some(isQubitVisible)) continue;
        // Hit if pointer is within any target square.
        for (const q of op.id_targets) {
          const [x, y] = qubitDrawCoords(q);
          if (contentX >= x - rad && contentX <= x + rad && contentY >= y - rad && contentY <= y + rad) {
            const id = `g:${snap.curLayer}:${op.id_targets[0]}`;
            candidates.push({ kind: 'gate', id, z: 300 });
            break;
          }
        }
      }
    }
  }

  // Qubits (top of the non-gate stack)
  for (const q of circuit.allQubits()) {
    if (!isQubitVisible(q)) continue;
    const [x, y] = qubitDrawCoords(q);
    if (contentX >= x - rad && contentX <= x + rad && contentY >= y - rad && contentY <= y + rad) {
      candidates.push({ kind: 'qubit', id: `q:${q}`, z: 200 });
    }
  }

  // Connections (under qubits). Collect last-write per edge up to curLayer.
  const edgeMap = new Map(); // key -> {q1,q2,sheet,thickness}
  for (let r = 0; r <= snap.curLayer && r < circuit.layers.length; r++) {
    const anns = circuit.layers[r].annotations || [];
    for (const a of anns) {
      if (!a || a.kind !== 'ConnSet') continue;
      const sheetName = a.sheet?.name || a.sheet || 'DEFAULT';
      if (!visibleSheets.has(sheetName)) continue;
      const edges = Array.isArray(a.edges) ? a.edges : [];
      for (const e of edges) {
        if (!Array.isArray(e) || e.length !== 2) continue;
        let [q1, q2] = e.map(v => parseInt(v));
        if (!(Number.isFinite(q1) && Number.isFinite(q2))) continue;
        const a1 = Math.min(q1, q2);
        const a2 = Math.max(q1, q2);
        const key = `${a1}-${a2}`;
        edgeMap.set(key, { q1: a1, q2: a2, sheet: sheetName, thickness: a.thickness });
      }
    }
  }
  const connThresholdBase = 6;
  const plane = !embedding || embedding.type !== 'TORUS';
  for (const [key, { q1, q2, sheet, thickness }] of edgeMap.entries()) {
    let segments;
    if (plane) {
      segments = [[qubitDrawCoords(q1), qubitDrawCoords(q2)]];
    } else {
      const p1 = getPanelXY(q1), p2 = getPanelXY(q2);
      const segs = torusSegmentsBetween(p1, p2, embedding.Lx, embedding.Ly);
      segments = segs.map(([[sx, sy], [tx, ty]]) => [c2d(sx, sy), c2d(tx, ty)]);
    }
    const tolerance = Math.max(connThresholdBase, (Number.isFinite(thickness) ? (thickness/2 + 3) : connThresholdBase));
    for (const [[x1, y1], [x2, y2]] of segments) {
      const d = distToSeg(contentX, contentY, x1, y1, x2, y2);
      if (d <= tolerance) {
        candidates.push({ kind: 'connection', id: `c:${sheet}:${key}`, z: 150 });
        break;
      }
    }
  }

  // Polygons (under connections): match latest layer <= curLayer that has polygons.
  let lastPolyLayer = -1;
  for (let r = 0; r <= snap.curLayer && r < circuit.layers.length; r++) {
    const anns = circuit.layers[r].annotations || [];
    if (anns.some(a => a && a.kind === 'Polygon')) lastPolyLayer = r;
  }
  if (lastPolyLayer >= 0) {
    const anns = (circuit.layers[lastPolyLayer].annotations || []).filter(a => a && a.kind === 'Polygon');
    for (const a of anns) {
      const sheetName = a.sheet?.name || a.sheet || 'DEFAULT';
      if (!visibleSheets.has(sheetName)) continue;
      const ids = Array.isArray(a.targets) ? a.targets : [];
      const pts = ids.map(q => qubitDrawCoords(q));
      if (pts.length < 3) continue;
      // Winding test
      let inside = false;
      for (let i=0,j=pts.length-1; i<pts.length; j=i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        const intersect = ((yi>contentY)!=(yj>contentY)) && (contentX < (xj - xi)*(contentY - yi)/(yj - yi + 1e-9) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) {
        const key = `p:${lastPolyLayer}:${(a.polyIndex ?? -1)}`;
        candidates.push({ kind: 'polygon', id: key, z: 100 });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a,b) => a.z - b.z); // lowest first
  return candidates[candidates.length - 1]; // topmost
}
