import { Operation } from '../circuit/operation.js';

/** Shared helpers to allocate coords into qubits on a copied circuit. */
function ensureQubitForCoord(circuit, coord, getTargetSheet) {
  const key = `${coord.x},${coord.y}`;
  // Find existing qubit at exact panel coords if any
  try {
    for (const [qid, q] of circuit.qubits.entries()) {
      if (q && q.panelX === coord.x && q.panelY === coord.y) return qid;
    }
  } catch {}
  // Allocate new id
  let newId = 0;
  try { for (const k of circuit.qubit_coords.keys()) newId = Math.max(newId, k + 1); } catch {}
  circuit.qubit_coords.set(newId, [coord.x, coord.y]);
  // Attach per-qubit metadata: panel coords + sheet from toolbox selection
  try {
    const sheetName = (typeof getTargetSheet === 'function' ? getTargetSheet() : null) || 'DEFAULT';
    const meta = { id: newId, stimX: coord.x, stimY: coord.y, panelX: coord.x, panelY: coord.y, sheet: sheetName };
    if (!circuit.qubits) circuit.qubits = new Map();
    circuit.qubits.set(newId, meta);
  } catch {}
  return newId;
}

export class EdgeChainPlacementController {
  constructor(deps) {
    this._getCircuit = deps.getCircuit;
    this._getCurrentLayer = deps.getCurrentLayer;
    this._getEditorState = deps.getEditorState;
    this._getTargetSheet = deps.getTargetSheet || (()=>'DEFAULT');
    this._pushStatus = deps.pushStatus || (()=>{});
    this._onStateChange = deps.onStateChange || (()=>{});
    this.reset();
  }
  reset() {
    this.active = false;
    this.color = '#b0b5ba';
    this.thickness = undefined;
    this.startPoint = null; // { id } or { coord }
    this.phantom = null; // {x,y}
    this.hoverQubit = null;
    this.edgesCommitted = 0;
  }
  isActive() { return !!this.active; }
  start(color, thickness) {
    this.reset();
    this.active = true;
    if (typeof color === 'string' && color.length) this.color = color;
    if (typeof thickness === 'number' && isFinite(thickness)) this.thickness = thickness;
    this._pushStatus('Edge placement: click first point, then next; Enter to finish, Esc to cancel.', 'info');
    this._onStateChange();
  }
  cancel() { if (!this.active) return; this.reset(); this._onStateChange(); this._pushStatus('Edge placement canceled.', 'info'); }
  finalize() {
    if (!this.active) return false;
    // Nothing to commit at finalize; edges were committed incrementally.
    this._pushStatus(`Edge placement finished. Added ${this.edgesCommitted} edge(s).`, 'info');
    this.reset();
    this._onStateChange();
    return true;
  }
  onKeydown(e) {
    if (!this.active) return false;
    if (e.key === 'Escape') { this.cancel(); return true; }
    if (e.key === 'Enter') { this.finalize(); return true; }
    return false;
  }
  onPanelMove(hit, phantom) {
    if (!this.active) return;
    if (hit && hit.kind === 'qubit') {
      const q = parseInt(hit.id.split(':')[1]);
      this.hoverQubit = Number.isFinite(q) ? q : null;
    } else {
      this.hoverQubit = null;
    }
    this.phantom = phantom || null;
  }
  onPanelClick(hit) {
    if (!this.active) return false;
    const clickIsQubit = !!(hit && hit.kind === 'qubit');
    const secondPoint = clickIsQubit
      ? { id: parseInt(hit.id.split(':')[1]) }
      : (this.phantom && Number.isFinite(this.phantom.x) && Number.isFinite(this.phantom.y))
        ? { coord: { x: this.phantom.x, y: this.phantom.y } }
        : null;
    if (!this.startPoint) {
      if (!secondPoint) return false;
      this.startPoint = secondPoint;
      const desc = this.startPoint.id !== undefined ? `q${this.startPoint.id}` : `(${this.startPoint.coord.x},${this.startPoint.coord.y})`;
      this._pushStatus(`Edge start: ${desc}. Click next point to add an edge.`, 'info');
      this._onStateChange();
      return true;
    } else {
      if (!secondPoint) return false;
      // Commit single edge between start and secondPoint
      const es = this._getEditorState();
      if (!es) { this.cancel(); return true; }
      const c = es.copyOfCurAnnotatedCircuit();
      const layerIdx = this._getCurrentLayer();
      while (c.layers.length <= layerIdx) c.layers.push(c.layers[c.layers.length-1]?.copy?.() || new (c.layers[0].constructor)());
      const sheetName = this._getTargetSheet() || 'DEFAULT';
      const aId = (this.startPoint.id !== undefined && Number.isFinite(this.startPoint.id))
        ? this.startPoint.id
        : ensureQubitForCoord(c, this.startPoint.coord, this._getTargetSheet);
      const bId = (secondPoint.id !== undefined && Number.isFinite(secondPoint.id))
        ? secondPoint.id
        : ensureQubitForCoord(c, secondPoint.coord, this._getTargetSheet);
      if (aId === bId) { this._pushStatus('Ignored degenerate edge (same point).', 'warning'); return true; }
      const anns = c.layers[layerIdx].annotations = c.layers[layerIdx].annotations || [];
      const entry = { kind: 'ConnSet', sheet: { name: sheetName }, edges: [[Math.min(aId,bId), Math.max(aId,bId)]], colour: this.color };
      if (typeof this.thickness === 'number' && isFinite(this.thickness)) entry.thickness = this.thickness;
      anns.push(entry);
      es._pendingDesc = 'Add edge';
      es.commit(c);
      this.edgesCommitted += 1;
      this._pushStatus(`Added edge q${Math.min(aId,bId)}-q${Math.max(aId,bId)} on ${sheetName}. Click next point to continue, Enter to finish.`, 'info');
      // Continue chaining: new start is secondPoint
      this.startPoint = { id: bId };
      this._onStateChange();
      return true;
    }
  }
  getOverlay() {
    if (!this.active) return null;
    return {
      kind: 'edge-chain',
      color: this.color,
      startPoint: this.startPoint ? (this.startPoint.id !== undefined ? { id: this.startPoint.id } : { coord: { ...this.startPoint.coord } }) : null,
      phantom: this.phantom ? { x: this.phantom.x, y: this.phantom.y } : null,
      hoverQubit: this.hoverQubit,
    };
  }
}

export class PolygonChainPlacementController {
  constructor(deps) {
    this._getCircuit = deps.getCircuit;
    this._getCurrentLayer = deps.getCurrentLayer;
    this._getEditorState = deps.getEditorState;
    this._getTargetSheet = deps.getTargetSheet || (()=>'DEFAULT');
    this._pushStatus = deps.pushStatus || (()=>{});
    this._onStateChange = deps.onStateChange || (()=>{});
    this.reset();
  }
  reset() {
    this.active = false;
    this.fill = 'rgba(0,0,0,0.25)';
    this.points = []; // sequence of { id:number } or { coord:{x,y} }
    this.phantom = null; // {x,y}
    this.hoverQubit = null;
  }
  isActive() { return !!this.active; }
  start(fill) {
    this.reset();
    this.active = true;
    if (typeof fill === 'string' && fill.length) this.fill = fill;
    this._pushStatus('Polygon placement: click to add vertices, Enter to finish, Esc to cancel.', 'info');
    this._onStateChange();
  }
  cancel() { if (!this.active) return; this.reset(); this._onStateChange(); this._pushStatus('Polygon placement canceled.', 'info'); }
  finalize() {
    if (!this.active) return false;
    if (this.points.length < 1) { this.cancel(); return false; }
    const es = this._getEditorState();
    if (!es) { this.cancel(); return false; }
    const c = es.copyOfCurAnnotatedCircuit();
    const layerIdx = this._getCurrentLayer();
    while (c.layers.length <= layerIdx) c.layers.push(c.layers[c.layers.length-1]?.copy?.() || new (c.layers[0].constructor)());
    const sheetName = this._getTargetSheet() || 'DEFAULT';
    // Resolve ids
    const ids = [];
    for (const p of this.points) {
      if (p.id !== undefined && Number.isFinite(p.id)) ids.push(p.id);
      else if (p.coord) ids.push(ensureQubitForCoord(c, p.coord, this._getTargetSheet));
    }
    const anns = c.layers[layerIdx].annotations = c.layers[layerIdx].annotations || [];
    const polyIndex = anns.filter(a => a && a.kind === 'Polygon').length;
    anns.push({ kind: 'Polygon', sheet: sheetName, stroke: 'none', fill: this.fill, targets: ids.slice(), polyIndex });
    es._pendingDesc = 'Add polygon';
    es.commit(c);
    this._pushStatus(`Added polygon with ${ids.length} vertex/vertices on sheet ${sheetName} at layer ${layerIdx}.`, 'info');
    this.reset();
    this._onStateChange();
    return true;
  }
  onKeydown(e) {
    if (!this.active) return false;
    if (e.key === 'Escape') { this.cancel(); return true; }
    if (e.key === 'Enter') { this.finalize(); return true; }
    return false;
  }
  onPanelMove(hit, phantom) {
    if (!this.active) return;
    if (hit && hit.kind === 'qubit') {
      const q = parseInt(hit.id.split(':')[1]);
      this.hoverQubit = Number.isFinite(q) ? q : null;
    } else {
      this.hoverQubit = null;
    }
    this.phantom = phantom || null;
  }
  onPanelClick(hit) {
    if (!this.active) return false;
    const clickIsQubit = !!(hit && hit.kind === 'qubit');
    if (clickIsQubit) {
      const q = parseInt(hit.id.split(':')[1]);
      this.points.push({ id: q });
    } else if (this.phantom && Number.isFinite(this.phantom.x) && Number.isFinite(this.phantom.y)) {
      this.points.push({ coord: { x: this.phantom.x, y: this.phantom.y } });
    } else {
      return false;
    }
    // Status update with progress
    try {
      const parts = this.points.map(p => p.id !== undefined ? `q${p.id}` : `(${p.coord.x},${p.coord.y})`);
      this._pushStatus(`Polygon vertices: ${this.points.length} — ${parts.join(' , ')}`, 'info');
    } catch {}
    this._onStateChange();
    return true;
  }
  getOverlay() {
    if (!this.active) return null;
    return {
      kind: 'polygon-chain',
      fill: this.fill,
      points: this.points.slice(),
      phantom: this.phantom ? { x: this.phantom.x, y: this.phantom.y } : null,
      hoverQubit: this.hoverQubit,
    };
  }
}
