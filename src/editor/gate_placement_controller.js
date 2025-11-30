import { GATE_MAP } from '../gates/gateset.js';
import { make_mpp_gate } from '../gates/gateset_mpp.js';
import { Operation } from '../circuit/operation.js';

/**
 * Manages interactive gate placement (single/two-qubit; extensible to multi-qubit).
 * Keeps all UI-independent logic here; caller wires mouse/keyboard and rendering.
 */
export class GatePlacementController {
  /**
   * @param {{
   *  getCircuit: () => any,
   *  getCurrentLayer: () => number,
   *  getEditorState: () => any,
   *  pushStatus: (msg:string, sev?:'info'|'warning'|'error') => void,
   *  onStateChange?: () => void,
   * }} deps
   */
  constructor(deps) {
    this._getCircuit = deps.getCircuit;
    this._getCurrentLayer = deps.getCurrentLayer;
    this._getEditorState = deps.getEditorState;
    this._pushStatus = deps.pushStatus || (()=>{});
    this._onStateChange = deps.onStateChange || (()=>{});
    this._onFlashGate = deps.onFlashGate || ((_)=>{});

    this._getTargetSheet = deps.getTargetSheet || (()=>'DEFAULT');
    this.reset();
  }

  reset() {
    this.active = false;
    this.mode = 'idle'; // 'idle'|'single'|'two_first'|'two_second'|'multi'
    this.activeGateId = null;
    this.gateArgs = new Float32Array([]);
    this.firstQubit = null;
    this.firstCoord = null; // {x,y} when first target is a phantom lattice point
    this.multiQubits = new Set();
    this.multiCoords = new Set(); // store as serialized 'x,y'
    this.hoverQubit = null;
    this.phantom = null; // {x,y} current hover phantom
  }

  isActive() { return !!this.active; }

  /** Begin placement for a gate by id (e.g. 'H', 'CX', 'MXX', 'SQRT_XX'). */
  start(gateId, args = new Float32Array([])) {
    let g = GATE_MAP.get(gateId);
    if (!g) {
      if (typeof gateId === 'string' && gateId.startsWith('MPP:')) {
        // Accept dynamic MPP:... base; handled in commit.
        this.reset();
        this.active = true;
        this.activeGateId = gateId;
        this.gateArgs = new Float32Array([]);
        this.mode = 'multi';
        this._pushStatus(`Placing ${gateId}: click qubits; Enter to finish, Esc to cancel.`, 'info');
        this._onStateChange();
        return true;
      }
      this._pushStatus(`Unknown gate ${gateId}`, 'warning');
      return false;
    }
    this.reset();
    this.active = true;
    this.activeGateId = gateId;
    this.gateArgs = args instanceof Float32Array ? args : new Float32Array(args || []);
    if (g.num_qubits === 1) {
      this.mode = 'single';
      this._pushStatus(`Placing ${gateId}: click a qubit, or click outside to cancel.`, 'info');
    } else if (g.num_qubits === 2) {
      this.mode = 'two_first';
      this._pushStatus(`Placing ${gateId}: click first qubit, or click outside to cancel.`, 'info');
    } else {
      // Future: generic multi-qubit
      this.mode = 'multi';
      this._pushStatus(`Placing ${gateId}: click qubits; Enter to finish, Esc to cancel.`, 'info');
    }
    this._onStateChange();
    return true;
  }

  cancel(reason) {
    if (!this.active) return;
    this._pushStatus(reason || 'Placement canceled.', 'info');
    this.reset();
    this._onStateChange();
  }

  finalize() {
    if (!this.active) return false;
    if (this.mode === 'multi' && (this.multiQubits.size > 0 || this.multiCoords.size > 0)) {
      // Resolve coords to new ids then commit
      const targets = [
        ...[...this.multiQubits].map(id=>({id})),
        ...[...this.multiCoords].map(s=>({coord: {x:parseFloat(s.split(',')[0]), y:parseFloat(s.split(',')[1])}})),
      ];
      return this._commitWithNewQubitsAndTargets(targets);
    }
    // For single/two-qubit flows, finalize is not used (we commit on valid click). Just cancel.
    this.cancel();
    return false;
  }

  onKeydown(e) {
    if (!this.active) return false;
    if (e.key === 'Escape') { this.cancel(); return true; }
    if (e.key === 'Enter') { if (this.mode === 'multi') { this.finalize(); return true; } }
    return false;
  }

  /**
   * @param {{kind:string,id:string}|null} hit
   */
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

  /** Handle a panel click; returns true if the event was consumed. */
  onPanelClick(hit) {
    if (!this.active) return false;
    const layer = this._getCurrentLayer();
    const es = this._getEditorState();
    const circuit = es ? es.copyOfCurAnnotatedCircuit() : (this._getCircuit() || null);
    if (!circuit) { this.cancel('No circuit.'); return true; }
    const annLayer = circuit.layers[layer];
    const occupied = (q) => !!annLayer && annLayer.id_ops && annLayer.id_ops.has(q);

    const g = GATE_MAP.get(this.activeGateId);
    const clickIsQubit = hit && hit.kind === 'qubit';
    let q = clickIsQubit ? parseInt(hit.id.split(':')[1]) : NaN;
    const clickedPhantom = !clickIsQubit && this.phantom && Number.isFinite(this.phantom.x) && Number.isFinite(this.phantom.y);
    if (!clickIsQubit && !clickedPhantom) { this.cancel(); return true; }

    // Determine placement kind. If no gate in GATE_MAP (e.g. MPP:...), treat as multi.
    const isMulti = !g || (g.num_qubits !== 1 && g.num_qubits !== 2) || this.mode === 'multi' || (typeof this.activeGateId === 'string' && this.activeGateId.startsWith('MPP:'));

    if (!isMulti && g.num_qubits === 1) {
      if (clickIsQubit) {
        if (occupied(q)) { this._flashFail(`Qubit ${q} occupied at this layer.`); return true; }
        this._commitGate([q]);
      } else {
        // Create a new qubit and place gate on it in one commit
        this._commitWithNewQubitsAndTargets([{coord: {x:this.phantom.x, y:this.phantom.y}}]);
      }
      return true;
    } else if (!isMulti && g.num_qubits === 2) {
      if (this.mode === 'two_first') {
        if (clickIsQubit) {
          if (occupied(q)) { this._flashFail(`Qubit ${q} occupied at this layer.`); return true; }
          this.firstQubit = q;
          this.firstCoord = null;
        } else {
          this.firstQubit = null;
          this.firstCoord = { x: this.phantom.x, y: this.phantom.y };
        }
        this.mode = 'two_second';
        this._pushStatus(`Selected ${clickIsQubit ? `q${q}` : `(${this.phantom.x},${this.phantom.y})`}. Choose second qubit (Esc to cancel).`, 'info');
        this._onStateChange();
        return true;
      } else if (this.mode === 'two_second') {
        let targets = [];
        // Resolve first target (id or coord)
        if (this.firstCoord) targets.push({coord: this.firstCoord}); else targets.push({id: this.firstQubit});
        // Resolve second target
        if (clickIsQubit) {
          if (occupied(q)) { this._flashFail(`Qubit ${q} occupied at this layer.`); return true; }
          if (this.firstQubit != null && q === this.firstQubit) { this.cancel('Same qubit; canceled.'); return true; }
          targets.push({id: q});
        } else {
          targets.push({coord: {x:this.phantom.x, y:this.phantom.y}});
        }
        this._commitWithNewQubitsAndTargets(targets);
        return true;
      }
    } else {
      // multi
      if (clickIsQubit) {
        if (occupied(q)) { this._flashFail(`Qubit ${q} occupied at this layer.`); return true; }
        if (!this.multiQubits.has(q)) this.multiQubits.add(q);
      } else {
        const key = `${this.phantom.x},${this.phantom.y}`;
        this.multiCoords.add(key);
      }
      // Inform user of current target list
      try {
        const idList = [...this.multiQubits].sort((a,b)=>a-b);
        const coordList = [...this.multiCoords];
        const basis = (this.activeGateId && this.activeGateId.startsWith('MPP:')) ? this.activeGateId.substring(4) : '';
        const gateLabel = basis ? `MPP:${basis}` : (this.activeGateId || 'MPP');
        const parts = [];
        if (idList.length) parts.push(`q{${idList.join(',')}}`);
        if (coordList.length) parts.push(coordList.map(s=>`(${s})`).join(','));
        this._pushStatus(`${gateLabel} targets: ${parts.join(' , ')}. Enter to finish, Esc to cancel.`, 'info');
      } catch {}
      this._onStateChange();
      return true;
    }
    return false;
  }

  _flashFail(msg) {
    this._pushStatus(msg || 'Placement failed.', 'warning');
    try { if (this.activeGateId) this._onFlashGate(this.activeGateId); } catch {}
    // Caller re-renders; the button flash is handled in UI by re-rendering with same active gate.
  }

  /** Commit a gate targeting given qubits at current layer. */
  _commitGate(qids) {
    const es = this._getEditorState();
    if (!es) { this.cancel('No editor state.'); return false; }
    const circuit = es.copyOfCurAnnotatedCircuit();
    const layerIdx = this._getCurrentLayer();
    while (circuit.layers.length <= layerIdx) circuit.layers.push(circuit.layers[circuit.layers.length-1]?.copy?.() || new (circuit.layers[0].constructor)());
    const layer = circuit.layers[layerIdx];
    let gate = GATE_MAP.get(this.activeGateId);
    if (!gate && this.activeGateId && this.activeGateId.startsWith('MPP:')) {
      const base = (this.activeGateId.substring(4) || 'X').replace(/[^XYZ]/g,'X');
      const bases = base.repeat(Math.max(1, qids.length));
      gate = make_mpp_gate(bases);
    }
    try {
      const op = new Operation(gate, '', this.gateArgs, new Uint32Array(qids), -1);
      layer.put(op, false); // no overwrite
    } catch (e) {
      this._flashFail('Collision while placing gate.');
      return false;
    }
    es._pendingDesc = `Add ${this.activeGateId}`;
    es.commit(circuit);
    if (qids.length === 1) this._pushStatus(`Added ${this.activeGateId} at layer ${layerIdx} on q${qids[0]}.`, 'info');
    else this._pushStatus(`Added ${this.activeGateId} at layer ${layerIdx} on q{${qids.join(',')}}.`, 'info');
    this.reset();
    this._onStateChange();
    return true;
  }

  /** targets: array of {id} or {coord:{x,y}}; allocates new qubits for coords and commits */
  _commitWithNewQubitsAndTargets(targets) {
    const es = this._getEditorState();
    if (!es) { this.cancel('No editor state.'); return false; }
    const circuit = es.copyOfCurAnnotatedCircuit();
    const layerIdx = this._getCurrentLayer();
    while (circuit.layers.length <= layerIdx) circuit.layers.push(circuit.layers[circuit.layers.length-1]?.copy?.() || new (circuit.layers[0].constructor)());
    const layer = circuit.layers[layerIdx];
    const ids = [];
    // allocate ids for coord targets
    for (const t of targets) {
      if (t.id !== undefined && Number.isFinite(t.id)) { ids.push(t.id); continue; }
      const key = `${t.coord.x},${t.coord.y}`;
      // Find an existing qubit at exact panel coords if any
      let existing = null;
      try {
        for (const [qid, q] of circuit.qubits.entries()) {
          if (q && q.panelX === t.coord.x && q.panelY === t.coord.y) { existing = qid; break; }
        }
      } catch {}
      if (existing !== null) { ids.push(existing); continue; }
      // Allocate new id
      let newId = 0;
      try { for (const k of circuit.qubit_coords.keys()) newId = Math.max(newId, k+1); } catch {}
      circuit.qubit_coords.set(newId, [t.coord.x, t.coord.y]);
      // Attach per-qubit metadata: panel coords + sheet from toolbox selection
      try {
        const sheetName = this._getTargetSheet() || 'DEFAULT';
        const meta = { id: newId, stimX: t.coord.x, stimY: t.coord.y, panelX: t.coord.x, panelY: t.coord.y, sheet: sheetName };
        if (!circuit.qubits) circuit.qubits = new Map();
        circuit.qubits.set(newId, meta);
      } catch {}
      ids.push(newId);
    }
    // Build gate
    let gate = GATE_MAP.get(this.activeGateId);
    if (!gate && this.activeGateId && this.activeGateId.startsWith('MPP:')) {
      const base = (this.activeGateId.substring(4) || 'X').replace(/[^XYZ]/g,'X');
      const bases = base.repeat(Math.max(1, ids.length));
      gate = make_mpp_gate(bases);
    }
    try {
      const op = new Operation(gate, '', this.gateArgs, new Uint32Array(ids), -1);
      layer.put(op, false);
    } catch (e) {
      this._flashFail('Collision while placing gate.');
      return false;
    }
    es._pendingDesc = `Add ${this.activeGateId}`;
    es.commit(circuit);
    if (ids.length === 1) this._pushStatus(`Added ${this.activeGateId} at layer ${layerIdx} on q${ids[0]}.`, 'info');
    else this._pushStatus(`Added ${this.activeGateId} at layer ${layerIdx} on q{${ids.join(',')}}.`, 'info');
    this.reset();
    this._onStateChange();
    return true;
  }

  /**
   * Returns overlay draw data for panels.
   * { firstQubit, hoverQubit, mode, gateId, multiQubits:Set<number> }
   */
  getOverlay() {
    if (!this.active) return null;
    return {
      gateId: this.activeGateId,
      mode: this.mode,
      firstQubit: this.firstQubit,
      firstCoord: this.firstCoord,
      hoverQubit: this.hoverQubit,
      multiQubits: new Set(this.multiQubits),
      multiCoords: new Set(this.multiCoords),
      phantom: this.phantom ? { x: this.phantom.x, y: this.phantom.y } : null,
    };
  }
}
