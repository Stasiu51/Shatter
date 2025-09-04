// Annotated circuit parser (no deps). Inspired by circuit.js but simplified.
// Exports: parseAnnotated(text) and AnnotatedCircuit (class with static parse)

import { GATE_MAP, GATE_ALIAS_MAP } from '../gates/gateset.js';
import { Operation } from './operation.js';
import { AnnotatedLayer } from './annotated_layer.js';
import { Circuit } from '../../core/circuit/circuit.js'
import { Sheet } from './sheet.js'
/**
 * @typedef {{operations: any[], annotations: any[]}} AnnotatedLayer
 * @typedef {{layers: AnnotatedLayer[], qubit_coords?: Map<number,[number,number]>}} AnnotatedCircuitT
 * @typedef {{line:number, code:string, severity:'warning'|'error', message:string}} Diagnostic
 */

/** @type {Diagnostic} */
export const example = {
  line: 1,
  code: "E001",
  severity: "error",
  message: "Example error diagnostic for typedef",
};

export class AnnotatedCircuit {

  constructor() {
    /** @type {AnnotatedLayer[]} */
    this.layers = [new AnnotatedLayer()];
    /** @type {Map<number, [number, number]>} */
    this.qubit_coords = new Map();
    /** @type {Float64Array} */
    this.qubitCoordData = []
    /** @type {Map<string, Sheet>} */
    this.sheets = new Map([["DEFAULT", new Sheet("DEFAULT")]]);
  }

  /** @param {string} text */
  static parse(text) {

    const circuit = new AnnotatedCircuit();

    const diagnostics = /** @type {Diagnostic[]} */([]);
    let currentLayer = circuit.layers[0];

    /** Pending anchored annotation that must attach to the next crumble op. */
    /** @type {null | { line:number, anchorKind:'OP'|'GATE', build:(opIndex:number, layerIndex:number) => any }} */
    let pendingAnchor = null;

    /** Pending polygon header waiting for the immediate polygon body line. */
    /** @type {null | { line:number, header:any }} */
    let pendingPolyHdr = null;

    // Enforce SHEET-at-top rule.
    let seenNonSheetContent = false;

    // REPEAT replay stack.
    /** @type {{times:number, lines:{text:string,lineNo:number}[], startLine:number}[]} */
    const stack = [];

    // LINES TO INSERT after parsing (currently just polygon headers)
    /** @type {{lineNo:number, line:string}} */
    const insertList = [];

    const PARSE_ERROR = Symbol('FATAL_PARSE_ABORT');

    function diag(line, code, severity, message) {
      diagnostics.push({ line, code, severity, message });
      if (severity === 'error') {
        throw PARSE_ERROR;               // ← abort parsing immediately
      }
    }
    const barrier = (lineNo) => {
      if (pendingPolyHdr) {
        diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
        pendingPolyHdr = null;
      }
      pendingAnchor = null;
    };
    /**
     * @param {string} name 
     */
    function getSheet(name) {
      if (!circuit.sheets.has(name)) {
        diag(lineNo, 'SHEET003', 'error', `No such sheet ${name}.`);
      }
      return circuit.sheets.get(name);
    }

    /** @param {string} s */
    const isBlank = (s) => /^\s*$/.test(s);
    /** @param {string} s */
    function isComment(line) {
      const s = String(line).trimStart();
      if (s.startsWith('##!')) return false;      // overlay directive
      if (s.startsWith('#!')) return false;       // any other non-comment pragma-like control line
      return s.startsWith('#');                   // actual comments only
    }

    /** @param {string} line */
    function parseAnnotationDirective(line, lineNo) {
      // Strip leading ##!
      const body = line.replace(/^\s*##!\s*/, '').trim();
      const [head, ...rest] = body.split(/\s+/);
      const argsStr = rest.join(' ');
      const KVs = parseKVs(argsStr);

      const kind = (head || '').toUpperCase();

      if (kind === 'SHEET') {
        const name = getStr(KVs, 'NAME');
        const sheet = new Sheet(name);
        if (seenNonSheetContent) {
          diag(lineNo, 'SHEET001', 'error', '##! SHEET must appear at the top of the file before any other content.');
        }
        if (circuit.sheets.has(name)) {
          diag(lineNo, 'SHEET002', 'error', `Sheet ${name} declared twice (note DEFAULT exists by default)`)
        }
        circuit.sheets.set(name, sheet);
        return;
      }

      if (kind === 'CONN' || kind === 'CONN_SET' || (kind === 'CONN' && (rest[0] || '').toUpperCase() === 'SET')) {
        const sheet = getSheet(getStr(KVs, 'SHEET', undefined));
        const droop = getNum(KVs, 'DROOP', undefined);
        const edgesStr = KVs.get('EDGES');
        /** @type {Array<[number,number]>} */
        const edges = [];
        if (typeof edgesStr === 'string') {
          for (const part of edgesStr.replace(/[()]/g, '').split(/\s*,\s*/)) {
            if (!part) continue;
            const m = part.match(/(-?\d+)\s*-\s*(-?\d+)/);
            if (m) {
              edges.push([parseInt(m[1]), parseInt(m[2])]);
            }
          }
        }
        currentLayer.annotations.push({ kind: 'ConnSet', line: lineNo, sheet, droop, edges });
        return;
      }

      if (kind === 'HIGHLIGHT') {
        const target = (getStr(KVs, 'TARGET', 'GATE') || 'GATE').toUpperCase();
        const color = getStr(KVs, 'COLOR', undefined);
        if (target === 'GATE') {
          pendingAnchor = {
            line: lineNo,
            anchorKind: 'GATE',
            build: (opIndex, layerIndex) => ({ kind: 'GateHighlight', line: lineNo, opIndex, color })
          };
          return;
        }
        // Other targets not yet implemented; fall back to free-form
        currentLayer.annotations.push({ kind: 'Highlight', line: lineNo, target, color });
        return;
      }

      if (kind === 'POLY' || kind === 'POLYGON' || kind === 'POLYHDR') {
        // Header; must be followed by a body line.
        const sheet = getSheet(getStr(KVs, 'SHEET', undefined));
        const stroke = getStr(KVs, 'STROKE', undefined);
        const fill = getStr(KVs, 'FILL', undefined);
        pendingPolyHdr = { line: lineNo, header: { sheet, stroke, fill } };
        return;
      }

      // Unknown annotation
      diag(lineNo, 'ANNOTATION001', 'error', `Unknown annotation command ${body}`);
    }

    function startNewLayer() {
      currentLayer = new AnnotatedLayer();
      circuit.layers.push(currentLayer);
    }

    /** Parse a crumble instruction line into an Operation or a side-effect (coords), or TICK. */
    function parseCrumble(line, lineNo) {
      const s = line.replace(/\s+#.*$/, '').trim(); // strip trailing # comment
      if (s.length === 0) return;

      if (/^TICK\b/.test(s)) {
        // Before switching layers, anchored polygon header missing body error.
        if (pendingPolyHdr) {
          diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
          pendingPolyHdr = null;
        }
        // Attach any pending anchored ann to *this* (but TICK isn't a gate, so skip)
        pendingAnchor = null;
        startNewLayer();
        return;
      }

      // POLYGON(r,g,b,a) t1 t2 ...
      const re = /^\s*POLYGON\(([^)]+)\)\s*(.*)$/;
      const m = line.match(re);
      if (m) {
        const color = m[1].split(/\s*,\s*/).map(Number);   // [r,g,b,a]
        if (color.length === 4) {
          const targets = m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : [];
          if (targets.length !== 0) {
            let { h, hdrLineNo, bdyLineNo } = [null, null, null];
            if (!pendingPolyHdr) {
              h = { sheet: 'DEFAULT', stroke: 'none', fill: String(color) }
              hdrLineNo = lineNo + insertList.length;
              insertList.push({ lineNo: lineNo, line: `##! POLY sheet=${h.sheet} stroke=${h.stroke} fill=(${h.fill})` });
              bdyLineNo = lineNo + insertList.length;
            }
            else {
              h = pendingPolyHdr.header;
              hdrLineNo = pendingPolyHdr.line + insertList.length;
              bdyLineNo = lineNo + insertList.length;
            }
            currentLayer.annotations.push({ kind: 'Polygon', headerLine: hdrLineNo, bodyLine: bdyLineNo, sheet: h.sheet, stroke: h.stroke, fill: h.fill, targets });
            pendingPolyHdr = null;
          }
          return
        }
        diag(lineNo, 'POLY002', 'error', 'Invalid POLYGON body.');
      }

      // The instruction isn't a polygon body
      if (pendingPolyHdr) {
        diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
      }

      // QUBIT_COORDS(x,y) q
      const mQC = s.match(/^QUBIT_COORDS\s*\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)\s+(-?\d+)\s*$/i);
      if (mQC) {
        const x = parseFloat(mQC[1]);
        const y = parseFloat(mQC[2]);
        const q = parseInt(mQC[3]);
        if ([...circuit.qubit_coords.values()].includes([x, y])) {
          diag(lineNo, 'COORD001', 'error', `Attempted to reuse coordinates ${[x, y]}`)
        }
        circuit.qubit_coords.set(q, [x, y]);
        // QUBIT_COORDS does not create an Operation.
        // Pending anchor is cleared by a crumble instruction line that is not a gate? The rule says it must attach to next crumble instruction; coords shouldn't count.
        // Treat coords as a barrier (safer).
        pendingAnchor = null;
        return;
      }

      // Generic gate line: NAME(args?) targets...
      const gateMatch = s.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?\s*(.*)$/);
      if (!gateMatch) {
        // Unknown crumble syntax.
        diag(lineNo, 'PAR003', 'error', 'Unrecognized instruction.');
        pendingAnchor = null;
        return;
      }
      let name = gateMatch[1].toUpperCase();
      if (GATE_ALIAS_MAP.has(name)) {
        name = GATE_ALIAS_MAP.get(name);
      }
      const argsStr = (gateMatch[2] || '').trim();
      const targetsStr = (gateMatch[3] || '').trim();

      const gate = GATE_MAP.get(name);
      if (!gate) {
        diag(lineNo, 'PAR004', 'error', `Unknown gate: ${name}`);
        pendingAnchor = null;
      }

      // Parse args as comma-separated floats.
      let args = [];
      if (argsStr.length) {
        for (const part of argsStr.split(',')) {
          const t = part.trim();
          if (t.length === 0) continue;
          const v = Number(t);
          if (!Number.isFinite(v)) {
            diag(lineNo, 'PAR005', 'error', `Bad gate argument: ${t}`);
            return;
          }
          args.push(v);
        }
      }
      // Parse targets as space/comma separated integers. (No rec[...] or ^ yet.)
      let targets = [];
      if (targetsStr.length) {
        for (const part of targetsStr.split(/[,\s]+/)) {
          const t = part.trim();
          if (!t) continue;
          if (!/^-?\d+$/.test(t)) {
            diag(lineNo, 'PAR006', 'error', `Bad target: ${t}`);
            return;
          }
          targets.push(parseInt(t));
        }
      }

      // Attach anchored annotation now (expects a gate).
      if (pendingAnchor) {
        if (pendingAnchor.anchorKind === 'GATE') {
          // okay; we'll add annotation with opIndex = cur.operations.length (before push)
          const opIndex = currentLayer.id_ops.length;
          currentLayer.annotations.push(pendingAnchor.build(opIndex, circuit.layers.length - 1));
        }
        pendingAnchor = null;
      }
      if (pendingPolyHdr) {
        diag(pendingPolyHdr.line, 'POLY001', 'error', '##! POLY must be immediately followed by "#! pragma POLYGON".');
        pendingPolyHdr = null;
      }

      const op = new Operation(gate, '', new Float32Array(args), new Uint32Array(targets), lineNo);
      // tack on line number (not part of original class but JS allows it)
      try {
        currentLayer.put(op, false);
      } catch (_) {
        circuit.layers.push(new AnnotatedLayer());
        currentLayer = circuit.layers[circuit.layers.length - 1];
        currentLayer.put(op, false);
      }
      seenNonSheetContent = true;
    }

    function parseKVs(s) {
      /** @type {Map<string,string>} */
      const m = new Map();
      const re = /(\b[A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(\"[^\"]*\"|[^\s]+))?/g;
      let k;
      while ((k = re.exec(s)) !== null) {
        const key = k[1].toUpperCase();
        let val = k[2] ?? '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        m.set(key, val);
      }
      return m;
    }
    function getStr(kvs, key, dflt = undefined) {
      return kvs.has(key) ? String(kvs.get(key)) : dflt;
    }
    function getNum(kvs, key, dflt = undefined) {
      if (!kvs.has(key)) return dflt;
      const v = Number(kvs.get(key));
      return Number.isFinite(v) ? v : dflt;
    }

    function processLine(raw, lineNo) {
      const s = raw.trim();
      if (isBlank(s) || isComment(s)) { barrier(lineNo); return; }

      // Annotation directives
      if (/^##!/.test(s)) { parseAnnotationDirective(s, lineNo); return; }

      // REPEAT open/close
      const mOpen = s.match(/^REPEAT\s+(\d+)\s*\{\s*$/i);
      if (mOpen) { barrier(lineNo); stack.push({ times: +mOpen[1], lines: [], startLine: lineNo }); return; }
      if (s === '}') {
        barrier(lineNo);
        const frame = stack.pop();
        if (!frame) { diag(lineNo, 'REP001', 'error', 'Unmatched }'); return; }
        for (let t = 0; t < frame.times; t++) {
          for (const L of frame.lines) processLine(L.text, L.lineNo);
        }
        return;
      }
      if (stack.length) { stack[stack.length - 1].lines.push({ text: s, lineNo }); return; }

      // Otherwise, crumble instruction
      parseCrumble(s, lineNo);
      seenNonSheetContent = true;
    }



    // const lines = text.split(/\r?\n/);
    const lines = text.replaceAll(';', '\n').
      replaceAll('#!pragma ERR', 'ERR').
      replaceAll('#!pragma MARK', 'MARK').
      replaceAll('#!pragma POLYGON', 'POLYGON').
      replaceAll('_', ' ').
      replaceAll('Q(', 'QUBIT_COORDS(').
      replaceAll('DT', 'DETECTOR').
      replaceAll('OI', 'OBSERVABLE_INCLUDE').
      replaceAll(' COORDS', '_COORDS').
      replaceAll(' ERROR', '_ERROR').
      replaceAll('C XYZ', 'C_XYZ').
      replaceAll('C NXYZ', 'C_NXYZ').
      replaceAll('C XNYZ', 'C_XNYZ').
      replaceAll('C XYNZ', 'C_XYNZ').
      replaceAll('H XY', 'H_XY').
      replaceAll('H XZ', 'H_XZ').
      replaceAll('H YZ', 'H_YZ').
      replaceAll('H NXY', 'H_NXY').
      replaceAll('H NXZ', 'H_NXZ').
      replaceAll('H NYZ', 'H_NYZ').
      replaceAll(' INCLUDE', '_INCLUDE').
      replaceAll('SQRT ', 'SQRT_').
      replaceAll(' DAG ', '_DAG ').
      replaceAll('C ZYX', 'C_ZYX').
      replaceAll('C NZYX', 'C_NZYX').
      replaceAll('C ZNYX', 'C_ZNYX').
      replaceAll('C ZYNX', 'C_ZYNX').
      split(/\r?\n/);
    try {
      for (let i = 0; i < lines.length; i++) {
        processLine(lines[i], i);
      }
    } catch (e) {
      // throw e;
      if (e !== PARSE_ERROR) {
        // real unexpected error — rethrow so we can see the stack
        throw e;
      }
    }

    if (stack.length) {
      const fr = stack[stack.length - 1];
      diag(fr.startLine, 'REP002', 'error', 'Unclosed REPEAT block');
    }

    // Assign coordinates to any qubits that don't have them
    let max_qubit_index = -1;
    for (let layer of circuit.layers) {
      for (let op of layer.id_ops.values()) {
        for (let id of op.id_targets) {
          max_qubit_index = Math.max(max_qubit_index, id);
          if (!circuit.qubit_coords.has(id)) {
            //Assign a new coordinate of the form [x,0]
            let x = 0;
            while ([...circuit.qubit_coords.values()].some(([cx, cy]) => cx === x && cy === 0)) {
              x += 1;
            }
            circuit.qubit_coords.set(id, [x, 0]);
          }
        }
      }
    }
    for (let id = 0; id <= max_qubit_index; id++) {
      if (!circuit.qubit_coords.has(id)) {
        //Assign a new coordinate of the form [x,0]
        let x = 0;
        while ([...circuit.qubit_coords.values()].includes([x, 0])) { x += 1; }
        circuit.qubit_coords.set(id, [x, 0]);
      }
      circuit.qubitCoordData[2 * id] = circuit.qubit_coords.get(id)[0];
      circuit.qubitCoordData[2 * id + 1] = circuit.qubit_coords.get(id)[1];
    }

    for (let { lineNo, line } of insertList) {
      lines.splice(lineNo, 0, line);
    }

    // Put the pragmas back. Most other replacements remain.
    text = lines.join("\n").replaceAll(';', '\n').
      replaceAll('ERR', '#!pragma ERR').
      replaceAll('MARK', '#!pragma MARK').
      replaceAll('POLYGON', '#!pragma POLYGON');
    return { circuit, diagnostics, text };
  }

  /**
   * @param {!string} stimCircuit
   * @returns {!AnnotatedCircuit, !Array<!Diagnostic>, String}
   */
  static fromStimCircuit(stimCircuit) {
    let r = AnnotatedCircuit.parse(stimCircuit);
    return r;
  }

  // Methods copied from stim_crumble/circuit/Circuit, adapted to AnnotatedCircuit

  /** @returns {!Set<!int>} */
  allQubits() {
    // Copied verbatim from Circuit.allQubits
    let result = new Set();
    for (let layer of this.layers) {
      for (let op of layer.iter_gates_and_markers()) {
        for (let t of op.id_targets) {
          result.add(t);
        }
      }
    }
    return result;
  }

  /** @returns {!AnnotatedCircuit} */
  rotated45() {
    // Copied verbatim from Circuit.rotated45
    return this.afterCoordTransform((x, y) => [x - y, x + y]);
  }

  coordTransformForRectification() {
    // Copied verbatim from Circuit.coordTransformForRectification
    let coordSet = new Map();
    for (let k = 0; k < this.qubitCoordData.length; k += 2) {
      let x = this.qubitCoordData[k];
      let y = this.qubitCoordData[k+1];
      coordSet.set(`${x},${y}`, [x, y]);
    }
    let minX = Infinity;
    let minY = Infinity;
    let step = 256;
    for (let [x, y] of coordSet.values()) {
      minX = Math.min(x, minX);
      minY = Math.min(y, minY);
      while ((x % step !== 0 || y % step !== 0) && step > 1 / 256) {
        step /= 2;
      }
    }
    let scale;
    if (step <= 1 / 256) {
      scale = 1;
    } else {
      scale = 1 / step;
      let mask = 0;
      for (let [x, y] of coordSet.values()) {
        let b1 = (x - minX + y - minY) % (2 * step);
        let b2 = (x - minX - y + minY) % (2 * step);
        mask |= b1 === 0 ? 1 : 2;
        mask |= b2 === 0 ? 4 : 8;
      }
      if (mask === (1 | 4)) {
        scale /= 2;
      } else if (mask === (2 | 8)) {
        minX -= step;
        scale /= 2;
      }
    }

    let offsetX = -minX;
    let offsetY = -minY;
    return (x, y) => [(x + offsetX) * scale, (y + offsetY) * scale];
  }

  /** @returns {!AnnotatedCircuit} */
  afterRectification() {
    // Copied verbatim from Circuit.afterRectification
    return this.afterCoordTransform(this.coordTransformForRectification());
  }

  /** @param {!number} dx @param {!number} dy @returns {!AnnotatedCircuit} */
  shifted(dx, dy) {
    // Copied verbatim from Circuit.shifted
    return this.afterCoordTransform((x, y) => [x + dx, y + dy]);
  }

  /** @return {!AnnotatedCircuit} */
  copy() {
    // Copied verbatim from Circuit.copy
    return this.shifted(0, 0);
  }

  /** @param {!function(!number, !number): ![!number, !number]} coordTransform @returns {!AnnotatedCircuit} */
  afterCoordTransform(coordTransform) {
    // Copied from Circuit.afterCoordTransform, modified to construct AnnotatedCircuit
    let newCoords = new Float64Array(this.qubitCoordData.length);
    for (let k = 0; k < this.qubitCoordData.length; k += 2) {
      let x = this.qubitCoordData[k];
      let y = this.qubitCoordData[k + 1];
      let [x2, y2] = coordTransform(x, y);
      newCoords[k] = x2;
      newCoords[k + 1] = y2;
    }
    let newLayers = this.layers.map(e => e.copy());
    // MODIFICATION: return AnnotatedCircuit
    const out = new AnnotatedCircuit();
    out.layers = newLayers;
    out.qubitCoordData = newCoords;
    out.sheets = new Map(this.sheets);
    return out;
  }

  /** @param {!Iterable<![!number, !number]>} coords */
  withCoordsIncluded(coords) {
    // Copied from Circuit.withCoordsIncluded, modified to construct AnnotatedCircuit
    let coordMap = this.coordToQubitMap();
    let extraCoordData = [];
    for (let [x, y] of coords) {
      let key = `${x},${y}`;
      if (!coordMap.has(key)) {
        coordMap.set(key, coordMap.size);
        extraCoordData.push(x, y);
      }
    }
    // MODIFICATION: return AnnotatedCircuit
    const out = new AnnotatedCircuit();
    out.layers = this.layers.map(e => e.copy());
    out.qubitCoordData = new Float64Array([...this.qubitCoordData, ...extraCoordData]);
    out.sheets = new Map(this.sheets);
    return out;
  }

  /** @returns {!Map<!string, !int>} */
  coordToQubitMap() {
    // Copied verbatim from Circuit.coordToQubitMap
    let result = new Map();
    for (let q = 0; q < this.qubitCoordData.length; q += 2) {
      let x = this.qubitCoordData[q];
      let y = this.qubitCoordData[q + 1];
      result.set(`${x},${y}`, q / 2);
    }
    return result;
  }

  /** @param {!boolean} orderForToStimCircuit @returns {!{dets: !Array<!{mids: !Array<!int>, qids: !Array<!int>}>, obs: !Map<!int, !Array.<!int>>}} */
  collectDetectorsAndObservables(orderForToStimCircuit) {
    // Copied verbatim from Circuit.collectDetectorsAndObservables
    // Index measurements.
    let m2d = new Map();
    for (let k = 0; k < this.layers.length; k++) {
      let layer = this.layers[k];
      if (orderForToStimCircuit) {
        for (let group of layer.opsGroupedByNameWithArgs().values()) {
          for (let op of group) {
            if (op.countMeasurements() > 0) {
              let target_id = op.id_targets[0];
              m2d.set(`${k}:${target_id}`, {mid: m2d.size, qids: op.id_targets});
            }
          }
        }
      } else {
        for (let [target_id, op] of layer.id_ops.entries()) {
          if (op.id_targets[0] === target_id) {
            if (op.countMeasurements() > 0) {
              m2d.set(`${k}:${target_id}`, {mid: m2d.size, qids: op.id_targets});
            }
          }
        }
      }
    }

    let detectors = [];
    let observables = new Map();
    for (let k = 0; k < this.layers.length; k++) {
      let layer = this.layers[k];
      for (let op of layer.markers) {
        if (op.gate.name === 'DETECTOR') {
          let d = Math.round(op.args[0]);
          while (detectors.length <= d) {
            detectors.push({mids: [], qids: []});
          }
          let det_entry = detectors[d];
          let key = `${k}:${op.id_targets[0]}`;
          let v = m2d.get(key);
          if (v !== undefined) {
            det_entry.mids.push(v.mid - m2d.size);
            det_entry.qids.push(...v.qids);
          }
        } else if (op.gate.name === 'OBSERVABLE_INCLUDE') {
          let d = Math.round(op.args[0]);
          let entries = observables.get(d);
          if (entries === undefined) {
            entries = []
            observables.set(d, entries);
          }
          let key = `${k}:${op.id_targets[0]}`;
          if (m2d.has(key)) {
            entries.push(m2d.get(key).mid - m2d.size);
          }
        }
      }
    }
    let seen = new Set();
    let keptDetectors = [];
    for (let ds of detectors) {
      if (ds.mids.length > 0) {
        ds.mids = [...new Set(ds.mids)];
        ds.mids.sort((a, b) => b - a);
        let key = ds.mids.join(':');
        if (!seen.has(key)) {
          seen.add(key);
          keptDetectors.push(ds);
        }
      }
    }
    for (let [k, vs] of observables.entries()) {
      vs = [...new Set(vs)]
      vs.sort((a, b) => b - a);
      observables.set(k, vs);
    }
    keptDetectors.sort((a, b) => a.mids[0] - b.mids[0]);
    return {dets: keptDetectors, obs: observables};
  }

  /** @returns {!string} */
  toStimCircuit() {
    // Copied from Circuit.toStimCircuit
    let usedQubits = new Set();
    for (let layer of this.layers) {
      for (let op of layer.iter_gates_and_markers()) {
        for (let t of op.id_targets) {
          usedQubits.add(t);
        }
      }
    }

    let {dets: remainingDetectors, obs: remainingObservables} = this.collectDetectorsAndObservables(true);
    remainingDetectors.reverse();
    let seenMeasurements = 0;
    let totalMeasurements = this.countMeasurements();

    let packedQubitCoords = [];
    for (let q of usedQubits) {
      let x = this.qubitCoordData[2*q];
      let y = this.qubitCoordData[2*q+1];
      packedQubitCoords.push({q, x, y});
    }
    packedQubitCoords.sort((a, b) => {
      if (a.x !== b.x) {
        return a.x - b.x;
      }
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      return a.q - b.q;
    });
    let old2new = new Map();
    let out = [];
    for (let q = 0; q < packedQubitCoords.length; q++) {
      let {q: old_q, x, y} = packedQubitCoords[q];
      old2new.set(old_q, q);
      out.push(`QUBIT_COORDS(${x}, ${y}) ${q}`);
    }
    let detectorLayer = 0;
    let usedDetectorCoords = new Set();

    for (let layer of this.layers) {
      let opsByName = layer.opsGroupedByNameWithArgs();

      for (let [nameWithArgs, group] of opsByName.entries()) {
        let targetGroups = [];

        let gateName = nameWithArgs.split('(')[0].split('[')[0];
        if (gateName === 'DETECTOR' || gateName === 'OBSERVABLE_INCLUDE') {
          continue;
        }

        let gate = GATE_MAP.get(gateName);
        if (gate === undefined && (gateName === 'MPP' || gateName === 'SPP' || gateName === 'SPP_DAG')) {
          // Copied verbatim: special-case pretty-printing for MPP/SPP groups
          let line = [gateName + ' '];
          for (let op of group) {
            seenMeasurements += op.countMeasurements();
            let bases = op.gate.name.substring(gateName.length + 1);
            for (let k = 0; k < op.id_targets.length; k++) {
              line.push(bases[k] + old2new.get(op.id_targets[k]));
              line.push('*');
            }
            line.pop();
            line.push(' ');
          }
          out.push(line.join('').trim());
        } else {
          if (gate !== undefined && gate.can_fuse) {
            let flatTargetGroups = [];
            for (let op of group) {
              seenMeasurements += op.countMeasurements();
              flatTargetGroups.push(...op.id_targets)
            }
            targetGroups.push(flatTargetGroups);
          } else {
            for (let op of group) {
              seenMeasurements += op.countMeasurements();
              targetGroups.push([...op.id_targets])
            }
          }

          for (let targetGroup of targetGroups) {
            let line = [nameWithArgs];
            for (let t of targetGroup) {
              line.push(old2new.get(t));
            }
            out.push(line.join(' '));
          }
        }
      }

      // Output DETECTOR lines immediately after the last measurement layer they use.
      let nextDetectorLayer = detectorLayer;
      while (remainingDetectors.length > 0) {
        let candidate = remainingDetectors[remainingDetectors.length - 1];
        let offset = totalMeasurements - seenMeasurements;
        if (candidate.mids[0] + offset >= 0) {
          break;
        }
        remainingDetectors.pop();
        let cxs = [];
        let cys = [];
        let sx = 0;
        let sy = 0;
        for (let q of candidate.qids) {
          let cx = this.qubitCoordData[2 * q];
          let cy = this.qubitCoordData[2 * q + 1];
          sx += cx;
          sy += cy;
          cxs.push(cx);
          cys.push(cy);
        }
        if (candidate.qids.length > 0) {
          sx /= candidate.qids.length;
          sy /= candidate.qids.length;
          sx = Math.round(sx * 2) / 2;
          sy = Math.round(sy * 2) / 2;
        }
        cxs.push(sx);
        cys.push(sy);
        let name;
        let dt = detectorLayer;
        for (let k = 0; ; k++) {
          if (k >= cxs.length) {
            k = 0;
            dt += 1;
          }
          name = `DETECTOR(${cxs[k]}, ${cys[k]}, ${dt})`;
          if (!usedDetectorCoords.has(name)) {
            break;
          }
        }
        usedDetectorCoords.add(name);
        let line = [name];
        for (let d of candidate.mids) {
          line.push(`rec[${d + offset}]`)
        }
        out.push(line.join(' '));
        nextDetectorLayer = Math.max(nextDetectorLayer, dt + 1);
      }
      detectorLayer = nextDetectorLayer;

      // Output OBSERVABLE_INCLUDE lines immediately after the last measurement layer they use.
      for (let [obsIndex, candidate] of [...remainingObservables.entries()]) {
        let offset = totalMeasurements - seenMeasurements;
        if (candidate[0] + offset >= 0) {
          continue;
        }
        remainingObservables.delete(obsIndex);
        let line = [`OBSERVABLE_INCLUDE(${obsIndex})`];
        for (let d of candidate) {
          line.push(`rec[${d + offset}]`)
        }
        out.push(line.join(' '));
      }

      out.push(`TICK`);
    }
    while (out.length > 0 && out[out.length - 1] === 'TICK') {
      out.pop();
    }

    return out.join('\n');
  }

  /** @returns {!int} */
  countMeasurements() {
    // Copied verbatim from Circuit.countMeasurements
    let total = 0;
    for (let layer of this.layers) {
      total += layer.countMeasurements();
    }
    return total;
  }
  
}
