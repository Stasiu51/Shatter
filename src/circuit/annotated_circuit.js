// Annotated circuit parser (no deps). Inspired by circuit.js but simplified.
// Exports: parseAnnotated(text) and AnnotatedCircuit (class with static parse)

import { GATE_MAP, GATE_ALIAS_MAP } from '../gates/gateset.js';
import { Operation } from './operation.js';
import { AnnotatedLayer } from './annotated_layer.js';
import { Sheet } from './sheet.js'
import {
  sheet_not_at_top,
  sheet_declared_twice,
  sheet_missing,
  qubit_requires_next_coords,
  qubit_expected_single_target,
  highlight_no_gate_anchor,
  poly_missing_body,
  poly_invalid_body,
  annotation_unknown_command,
  coord_single_target_required,
  coord_reuse,
  feedback_unsupported,
  gate_unrecognized,
  repeat_unmatched_close,
  repeat_unclosed_block,
} from '../diag/diag_factory.js';

/**
 * Per-qubit metadata for overlays and rendering.
 * - stimX/stimY: coordinates from Stim (QUBIT_COORDS or assigned default [x,0]).
 * - panelX/panelY: panel-space coordinates (defaults to stim coords; can be overridden by overlay QUBIT directive).
 * - sheet: name of the sheet this qubit belongs to (defaults to 'DEFAULT').
 * - text: permanent label to render near the qubit (optional).
 * - mouseover: tooltip text when hovering the qubit (optional).
 */
export class Qubit {
  /** @param {number} id @param {number} stimX @param {number} stimY */
  constructor(id, stimX, stimY) {
    this.id = id;
    this.stimX = stimX;
    this.stimY = stimY;
    this.panelX = stimX;
    this.panelY = stimY;
    this.sheet = 'DEFAULT';
    this.text = '';
    this.mouseover = '';
    this.colour = undefined;
    this.defective = false;
  }
}
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

/**
 * @param {!string} targetText
 * @returns {!Array.<!string>}
 */
function processTargetsTextIntoTargets(targetText) {
  let targets = [];
  let flush = () => {
    if (curTarget !== '') {
      targets.push(curTarget)
      curTarget = '';
    }
  }
  let curTarget = '';
  for (let c of targetText) {
    if (c === ' ') {
      flush();
    } else if (c === '*') {
      flush();
      targets.push('*');
    } else {
      curTarget += c;
    }
  }
  flush();

  return targets;
}

/**
 * @param {!Array.<!string>} targets
 * @returns {!Array.<!Array.<!string>>}
 */
function splitUncombinedTargets(targets) {
  let result = [];
  let start = 0;
  while (start < targets.length) {
    let end = start + 1;
    while (end < targets.length && targets[end] === '*') {
      end += 2;
    }
    if (end > targets.length) {
      throw Error(`Dangling combiner in ${targets}.`);
    }
    let term = [];
    for (let k = start; k < end; k += 2) {
      if (targets[k] === '*') {
        if (k === 0) {
          throw Error(`Leading combiner in ${targets}.`);
        }
        throw Error(`Adjacent combiners in ${targets}.`);
      }
      term.push(targets[k]);
    }
    result.push(term);
    start = end;
  }
  return result;
}

/**
 * @param {!string} tag
 * @param {!Float32Array} args
 * @param {!Array.<!string>} combinedTargets
 * @param {!boolean} convertIntoOtherGates
 * @returns {!Operation}
 */
function simplifiedMPP(tag, args, combinedTargets, convertIntoOtherGates) {
  let bases = '';
  let qubits = [];
  for (let t of combinedTargets) {
    if (t[0] === '!') {
      t = t.substring(1);
    }
    if (t[0] === 'X' || t[0] === 'Y' || t[0] === 'Z') {
      bases += t[0];
      let v = parseInt(t.substring(1));
      if (v !== v) {
        throw Error(`Non-Pauli target given to MPP: ${combinedTargets}`);
      }
      qubits.push(v);
    } else {
      throw Error(`Non-Pauli target given to MPP: ${combinedTargets}`);
    }
  }

  let gate = undefined;
  if (convertIntoOtherGates) {
    gate = GATE_MAP.get('M' + bases);
  }
  if (gate === undefined) {
    gate = GATE_MAP.get('MPP:' + bases);
  }
  if (gate === undefined) {
    gate = make_mpp_gate(bases);
  }
  return new Operation(gate, tag, args, new Uint32Array(qubits));
}

/**
 * @param {!string} tag
 * @param {!Float32Array} args
 * @param {!boolean} dag
 * @param {!Array.<!string>} combinedTargets
 * @returns {!Operation}
 */
function simplifiedSPP(tag, args, dag, combinedTargets) {
  let bases = '';
  let qubits = [];
  for (let t of combinedTargets) {
    if (t[0] === '!') {
      t = t.substring(1);
    }
    if (t[0] === 'X' || t[0] === 'Y' || t[0] === 'Z') {
      bases += t[0];
      let v = parseInt(t.substring(1));
      if (v !== v) {
        throw Error(`Non-Pauli target given to SPP: ${combinedTargets}`);
      }
      qubits.push(v);
    } else {
      throw Error(`Non-Pauli target given to SPP: ${combinedTargets}`);
    }
  }

  let gate = GATE_MAP.get((dag ? 'SPP_DAG:' : 'SPP:') + bases);
  if (gate === undefined) {
    gate = make_spp_gate(bases, dag);
  }
  return new Operation(gate, tag, args, new Uint32Array(qubits));
}


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
    /** @type {Map<number, Qubit>} */
    this.qubits = new Map();
  }

  /** @param {string} text */
  static parse(text) {

    const circuit = new AnnotatedCircuit();

    let measurement_locs = [];
    let num_detectors = 0;

    const diagnostics = /** @type {Diagnostic[]} */([]);
    let currentLayer = circuit.layers[0];

    /** Simple function callback anchor to run after an appropriate crumble command is processed. */
    /** @type {null | ((cmdName:string, args:any[], targets:any[])=>void)} */
    let pendingCallback = null;

    // Pending polygon header migrated to callback model (see pendingCallback below).

    // Enforce SHEET-at-top rule.
    let seenNonSheetContent = false;

    // REPEAT replay stack.
    /** @type {{times:number, lines:{text:string,lineNo:number}[], startLine:number}[]} */
    const stack = [];

    // LINES TO INSERT after parsing (currently just polygon headers)
    /** @type {{lineNo:number, line:string}} */
    const insertList = [];

    const PARSE_ERROR = Symbol('FATAL_PARSE_ABORT');

    function diag(diagnostic) {
      diagnostics.push(diagnostic);
      if (diagnostic.severity === 'error') {
        throw PARSE_ERROR;
      }
    }
    const barrier = (lineNo) => {};
    /**
     * @param {string} name 
     */
    function getSheet(name, lineNo) {
      if (!circuit.sheets.has(name)) {
        diag(sheet_missing(lineNo, name));
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
          diag(sheet_not_at_top(lineNo));
        }
        if (circuit.sheets.has(name)) {
          diag(sheet_declared_twice(lineNo, name))
        }
        circuit.sheets.set(name, sheet);
        return;
      }
      if (kind === 'QUBIT') {
        const qStr = getStr(KVs, 'Q', undefined);
        const px = getNum(KVs, 'X', undefined);
        const py = getNum(KVs, 'Y', undefined);
        const sheetName = getStr(KVs, 'SHEET', undefined);
        const text = getStr(KVs, 'TEXT', undefined);
        const mouseover = getStr(KVs, 'MOUSEOVER', undefined);
        const colour = getStr(KVs, 'COLOUR', undefined);
        const defectiveStr = getStr(KVs, 'DEFECTIVE', undefined);
        const parseBool = (s) => s === undefined ? undefined : /^(1|true|yes)$/i.test(String(s));

        const applyProps = (qid) => {
          if (qid === undefined || qid !== qid) return;
          let q = circuit.qubits.get(qid);
          if (!q) {
            const sx = circuit.qubit_coords.has(qid) ? circuit.qubit_coords.get(qid)[0] : 0;
            const sy = circuit.qubit_coords.has(qid) ? circuit.qubit_coords.get(qid)[1] : 0;
            q = new Qubit(qid, sx, sy);
          }
          if (px !== undefined) q.panelX = px;
          if (py !== undefined) q.panelY = py;
          if (sheetName !== undefined) q.sheet = sheetName;
          if (text !== undefined) q.text = text;
          if (mouseover !== undefined) q.mouseover = mouseover;
          if (colour !== undefined) q.colour = colour;
          const d = parseBool(defectiveStr);
          if (d !== undefined) q.defective = d;
          circuit.qubits.set(qid, q);
        };

        if (qStr && qStr.trim().length) {
          // Exactly one qubit id expected.
          const id = parseInt(qStr.trim());
          applyProps(id);
          return;
        } else {
          // Defer; the callback validates kind and applies after QUBIT_COORDS is processed.
          pendingCallback = (cmdName, args, targets) => {
            if (String(cmdName || '').toUpperCase() !== 'QUBIT_COORDS') {
              diag(qubit_requires_next_coords(lineNo));
              return;
            }
            // Expect exactly one target qubit id.
            if (!Array.isArray(targets) || targets.length !== 1) {
              diag(qubit_expected_single_target(lineNo));
              return;
            }
            applyProps(parseInt(targets[0]));
          };
          return;
        }
      }
      if (kind === 'CONN' || kind === 'CONN_SET' || (kind === 'CONN' && (rest[0] || '').toUpperCase() === 'SET')) {
        const sheet = getSheet(getStr(KVs, 'SHEET', undefined), lineNo);
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
          // Defer to the next gate-like crumble command, then annotate it.
          pendingCallback = (cmdName, args, targets) => {
            const gname = String(cmdName || '').toUpperCase();
            const gate = GATE_MAP.get(gname);
            if (!gate) {
              diag(highlight_no_gate_anchor(lineNo));
              return;
            }
            const ids = Array.isArray(targets)
              ? targets.map(t => parseInt(t)).filter(n => Number.isFinite(n))
              : [];
            currentLayer.annotations.push({ kind: 'GateHighlight', line: lineNo, color, gate: gname, targets: ids });
          };
          return;
        }
        // Other targets not yet implemented; fall back to free-form
        currentLayer.annotations.push({ kind: 'Highlight', line: lineNo, target, color });
        return;
      }

      if (kind === 'POLY') {
        // Store header info; body will arrive via next POLYGON(...) crumble.
        const sheet = getStr(KVs, 'SHEET', 'DEFAULT');
        const stroke = getStr(KVs, 'STROKE', 'none');
        const fill = getStr(KVs, 'FILL', undefined);
        const hdrLine = lineNo;
        pendingCallback = (cmdName, args, targets) => {
          if (String(cmdName || '').toUpperCase() !== 'POLYGON') {
            diag(poly_missing_body(hdrLine));
            return;
          }
          const color = Array.isArray(args) ? args.map(Number) : [];
          if (color.length !== 4 || color.some(v => !Number.isFinite(v))) {
            diag(poly_invalid_body(hdrLine));
            return;
          }
          const ids = (Array.isArray(targets) ? targets : [])
            .filter(t => t !== '*')
            .map(t => parseInt(t))
            .filter(n => Number.isFinite(n));
          if (ids.length === 0) {
            return;
          }
          currentLayer.annotations.push({ kind: 'Polygon', line: hdrLine, sheet, stroke, fill: fill ?? `(${color.join(',')})`, targets: ids });
        };
        return;
      }

      // Unknown annotation
      diag(annotation_unknown_command(lineNo, body));
    }



    let parseCrumbleLine = (line, lineNo) => {
      let args = [];
      let targets = [];
      let tag = '';
      let name = '';
      let firstSpace = line.indexOf(' ');
      let firstParens = line.indexOf('(');
      let tagStart = line.indexOf('[');
      let tagEnd = line.indexOf(']');
      if (tagStart !== -1 && firstSpace !== -1 && firstSpace < tagStart) {
        tagStart = -1;
      }
      if (tagStart !== -1 && firstParens !== -1 && firstParens < tagStart) {
        tagStart = -1;
      }
      if (tagStart !== -1 && tagEnd > tagStart) {
        tag = line.substring(tagStart + 1, tagEnd).replaceAll('\\C', ']').replaceAll('\\r', '\r').replaceAll('\\n', '\n').replaceAll('\\B', '\\');
        line = line.substring(0, tagStart) + ' ' + line.substring(tagEnd + 1)
      }
      if (line.indexOf(')') !== -1) {
        let [ab, c] = line.split(')');
        let [a, b] = ab.split('(');
        name = a.trim();
        args = b.split(',').map(e => e.trim()).map(parseFloat);
        targets = processTargetsTextIntoTargets(c);
      } else {
        let ab = line.split(' ').map(e => e.trim()).filter(e => e !== '');
        if (ab.length === 0) {
          return;
        }
        let [a, ...b] = ab;
        name = a.trim();
        args = [];
        targets = b.flatMap(processTargetsTextIntoTargets);
      }
      // Do not call anchors before processing; simple callback will fire at appropriate points instead.

      let reverse_pairs = false;
      if (name === '') {
        return;
      }
      if (args.length > 0 && ['M', 'MX', 'MY', 'MZ', 'MR', 'MRX', 'MRY', 'MRZ', 'MPP', 'MPAD'].indexOf(name) !== -1) {
        args = [];
      }
      let alias = GATE_ALIAS_MAP.get(name);
      if (alias !== undefined) {
        if (alias.ignore) {
          return;
        } else if (alias.name !== undefined) {
          reverse_pairs = alias.rev_pair !== undefined && alias.rev_pair;
          name = alias.name;
        } else {
          throw new Error(`Unimplemented alias ${name}: ${describe(alias)}.`);
        }
      }
      if (name === 'TICK') {
        circuit.layers.push(new AnnotatedLayer());
        currentLayer = circuit.layers[circuit.layers.length - 1];
        return;
      } else if (name === 'MPP') {
        let combinedTargets = splitUncombinedTargets(targets);
        for (let combo of combinedTargets) {
          let op = simplifiedMPP(tag, new Float32Array(args), combo, false);
          try {
            currentLayer.put(op, false);
          } catch (_) {
            circuit.layers.push(new AnnotatedLayer());
            currentLayer = circuit.layers[circuit.layers.length - 1];
            currentLayer.put(op, false);
          }
          measurement_locs.push({ layer: layers.length - 1, targets: op.id_targets });
        }
        if (pendingCallback) {
          try { pendingCallback('MPP', args, targets); } finally { pendingCallback = null; }
        }
        return;
      } else if (name === 'DETECTOR' || name === 'OBSERVABLE_INCLUDE') {
        let isDet = name === 'DETECTOR';
        let argIndex = isDet ? num_detectors : args.length > 0 ? Math.round(args[0]) : 0;
        for (let target of targets) {
          if (!target.startsWith("rec[-") || !target.endsWith("]")) {
            console.warn("Ignoring instruction due to non-record target: " + line);
            return;
          }
          let index = measurement_locs.length + Number.parseInt(target.substring(4, target.length - 1));
          if (index < 0 || index >= measurement_locs.length) {
            console.warn("Ignoring instruction due to out of range record target: " + line);
            return;
          }
          let loc = measurement_locs[index];
          circuit.layers[loc.layer].markers.push(
            new Operation(GATE_MAP.get(name),
              tag,
              new Float32Array([argIndex]),
              new Uint32Array([loc.targets[0]]),
            ));
        }
        num_detectors += isDet;
        if (pendingCallback) {
          try { pendingCallback(name, args, targets); } finally { pendingCallback = null; }
        }
        return;
      } else if (name === 'SPP' || name === 'SPP_DAG') {
        let dag = name === 'SPP_DAG';
        let combinedTargets = splitUncombinedTargets(targets);
        for (let combo of combinedTargets) {
          try {
            currentLayer.put(op, false);
          } catch (_) {
            circuit.layers.push(new AnnotatedLayer());
            currentLayer = circuit.layers[circuit.layers.length - 1];
            currentLayer.put(simplifiedSPP(tag, new Float32Array(args), dag, combo), false);
          }
        }
        if (pendingCallback) {
          try { pendingCallback(name, args, targets); } finally { pendingCallback = null; }
        }
        return;
      } else if (name.startsWith('POLYGON')) {
        // Handle polygon bodies without ever adding a crumble marker.
        // Extract color from args and targets from the remainder.
        const color = args.map(Number);
        const ids = (Array.isArray(targets) ? targets : [])
          .filter(t => t !== '*')
          .map(t => parseInt(t))
          .filter(n => Number.isFinite(n));
        if (pendingCallback) {
          try {
            pendingCallback('POLYGON', args, targets);
          } finally {
            pendingCallback = null;
          }
        } else {
          // Synthesize default header and record it, accounting for possible repeats.
          const h = { sheet: 'DEFAULT', stroke: 'none', fill: `(${color.join(',')})` };
          if (!insertList.some(item => item.lineNo === lineNo)) {
            insertList.push({ lineNo: lineNo, line: `##! POLY sheet=${h.sheet} stroke=${h.stroke} fill=${h.fill}` });
          }
          if (ids.length > 0) {
            currentLayer.annotations.push({ kind: 'Polygon', line: lineNo, sheet: h.sheet, stroke: h.stroke, fill: h.fill, targets: ids });
          }
        }
        return;
      } else if (name.startsWith('QUBIT_COORDS')) {
        let x = args.length < 1 ? 0 : args[0];
        let y = args.length < 2 ? 0 : args[1];
        if (targets.length !== 1){
          diag(coord_single_target_required(lineNo, line));
        }
        let q = parseInt(targets[0])
        if ([...circuit.qubit_coords.values()].includes([x, y])) {
          diag(coord_reuse(lineNo, x, y))
        }
        circuit.qubit_coords.set(q, [x, y]);
        // After processing coords, if there's a pending simple callback, run it now.
        if (pendingCallback) {
          try {
            pendingCallback('QUBIT_COORDS', args, targets);
          } finally {
            pendingCallback = null;
          }
        }
        return;
      }

      let has_feedback = false;
      for (let targ of targets) {
        if (targ.startsWith("rec[")) {
          if (name === "CX" || name === "CY" || name === "CZ" || name === "ZCX" || name === "ZCY") {
            has_feedback = true;
          }
        } else if (typeof parseInt(targ) !== 'number') {
          throw new Error(line);
        }
      }
      if (has_feedback) {
        let clean_targets = [];
        for (let k = 0; k < targets.length; k += 2) {
          let b0 = targets[k].startsWith("rec[");
          let b1 = targets[k + 1].startsWith("rec[");
          if (b0 || b1) {
            if (!b0) {
              currentLayer.put(new Operation(
                GATE_MAP.get("ERR"),
                tag,
                new Float32Array([]),
                new Uint32Array([targets[k]]),
                lineNo + insertList.length
              ));
            }
            if (!b1) {
              currentLayer.put(new Operation(
                GATE_MAP.get("ERR"),
                tag,
                new Float32Array([]),
                new Uint32Array([targets[k + 1]]),
                lineNo + insertList.length
              ));
            }
            const detail = `${name} ${targets[k]} ${targets[k + 1]}`;
            diag(feedback_unsupported(lineNo + insertList.length, detail));
          } else {
            clean_targets.push(targets[k]);
            clean_targets.push(targets[k + 1]);
          }
        }
        targets = clean_targets;
        if (targets.length === 0) {
          return;
        }
      }

      let gate = GATE_MAP.get(name);
      if (gate === undefined) {
        diag(gate_unrecognized(lineNo + insertList.length, line));
        return;
      }
      let a = new Float32Array(args);

      if (gate.num_qubits === undefined) {
        currentLayer.put(new Operation(gate, tag, a, new Uint32Array(targets)), lineNo + insertList.length);
      } else {
        if (targets.length % gate.num_qubits !== 0) {
          throw new Error("Incorrect number of targets in line " + line);
        }
        for (let k = 0; k < targets.length; k += gate.num_qubits) {
          let sub_targets = targets.slice(k, k + gate.num_qubits);
          if (reverse_pairs) {
            sub_targets.reverse();
          }
          let qs = new Uint32Array(sub_targets);
          let op = new Operation(gate, tag, a, qs, lineNo + insertList.length);
          try {
            currentLayer.put(op, false);
          } catch (_) {
            circuit.layers.push(new AnnotatedLayer());
            currentLayer = circuit.layers[circuit.layers.length - 1];
            currentLayer.put(op, false);
          }
          if (op.countMeasurements() > 0) {
            measurement_locs.push({ layer: circuit.layers.length - 1, targets: op.id_targets });
          }
        }
      }
      if (pendingCallback) {
        try { pendingCallback(name, args, targets); } finally { pendingCallback = null; }
      }
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
        if (!frame) { diag(repeat_unmatched_close(lineNo)); return; }
        for (let t = 0; t < frame.times; t++) {
          for (const L of frame.lines) processLine(L.text, L.lineNo);
        }
        return;
      }

      // Otherwise, crumble instruction
      parseCrumbleLine(s, lineNo);
      seenNonSheetContent = true;

      if (stack.length) { stack[stack.length - 1].lines.push({ text: s, lineNo }); return; }
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
      diag(repeat_unclosed_block(fr.startLine));
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
      const [sx, sy] = circuit.qubit_coords.get(id);
      circuit.qubitCoordData[2 * id] = sx;
      circuit.qubitCoordData[2 * id + 1] = sy;
      // Initialize or update qubit metadata (defaults).
      let q = circuit.qubits.get(id);
      if (!q) {
        q = new Qubit(id, sx, sy);
      } else {
        q.stimX = sx;
        q.stimY = sy;
        if (q.panelX === undefined) q.panelX = sx;
        if (q.panelY === undefined) q.panelY = sy;
        if (!q.sheet) q.sheet = 'DEFAULT';
      }
      circuit.qubits.set(id, q);
    }

    // for (let { lineNo, line } of insertList) {
    // lines.splice(lineNo, 0, line);
    // }
    insertList.forEach(({ lineNo, line }, index) => {
      lines.splice(lineNo + index, 0, line);
    });

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
      let y = this.qubitCoordData[k + 1];
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
    // Clone full circuit with transformed coordinates and preserved metadata.
    const newCoords = new Float64Array(this.qubitCoordData.length);
    for (let k = 0; k < this.qubitCoordData.length; k += 2) {
      const x = this.qubitCoordData[k];
      const y = this.qubitCoordData[k + 1];
      const [x2, y2] = coordTransform(x, y);
      newCoords[k] = x2;
      newCoords[k + 1] = y2;
    }
    const newLayers = this.layers.map(e => e.copy());

    const out = new AnnotatedCircuit();
    out.layers = newLayers;
    out.qubitCoordData = newCoords;
    out.sheets = new Map(this.sheets);
    // Clone and transform qubit_coords
    out.qubit_coords = new Map();
    for (const [id, [sx, sy]] of this.qubit_coords.entries()) {
      const [nx, ny] = coordTransform(sx, sy);
      out.qubit_coords.set(id, [nx, ny]);
    }
    // Clone qubits with stim coords transformed; update panel coords if they matched stim
    out.qubits = new Map();
    for (const [id, q] of this.qubits.entries()) {
      const nq = new Qubit(q.id, q.stimX, q.stimY);
      const [tsx, tsy] = coordTransform(q.stimX, q.stimY);
      nq.stimX = tsx;
      nq.stimY = tsy;
      const matchedPanelToStim = (q.panelX === q.stimX) && (q.panelY === q.stimY);
      if (matchedPanelToStim) {
        nq.panelX = tsx;
        nq.panelY = tsy;
      } else {
        nq.panelX = q.panelX;
        nq.panelY = q.panelY;
      }
      nq.sheet = q.sheet;
      nq.text = q.text;
      nq.mouseover = q.mouseover;
      nq.colour = q.colour;
      nq.defective = q.defective;
      out.qubits.set(id, nq);
    }
    return out;
  }

  /** @param {!Iterable<![!number, !number]>} coords */
  withCoordsIncluded(coords) {
    const coordMap = this.coordToQubitMap();
    const extraCoordData = [];
    for (const [x, y] of coords) {
      const key = `${x},${y}`;
      if (!coordMap.has(key)) {
        coordMap.set(key, coordMap.size);
        extraCoordData.push(x, y);
      }
    }
    const out = new AnnotatedCircuit();
    out.layers = this.layers.map(e => e.copy());
    out.qubitCoordData = new Float64Array([...this.qubitCoordData, ...extraCoordData]);
    out.sheets = new Map(this.sheets);
    // Copy qubit_coords and qubits as-is
    out.qubit_coords = new Map(this.qubit_coords);
    out.qubits = new Map();
    for (const [id, q] of this.qubits.entries()) {
      const nq = new Qubit(q.id, q.stimX, q.stimY);
      nq.panelX = q.panelX;
      nq.panelY = q.panelY;
      nq.sheet = q.sheet;
      nq.text = q.text;
      nq.mouseover = q.mouseover;
      nq.colour = q.colour;
      nq.defective = q.defective;
      out.qubits.set(id, nq);
    }
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
              m2d.set(`${k}:${target_id}`, { mid: m2d.size, qids: op.id_targets });
            }
          }
        }
      } else {
        for (let [target_id, op] of layer.id_ops.entries()) {
          if (op.id_targets[0] === target_id) {
            if (op.countMeasurements() > 0) {
              m2d.set(`${k}:${target_id}`, { mid: m2d.size, qids: op.id_targets });
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
            detectors.push({ mids: [], qids: [] });
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
    return { dets: keptDetectors, obs: observables };
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

    let { dets: remainingDetectors, obs: remainingObservables } = this.collectDetectorsAndObservables(true);
    remainingDetectors.reverse();
    let seenMeasurements = 0;
    let totalMeasurements = this.countMeasurements();

    let packedQubitCoords = [];
    for (let q of usedQubits) {
      let x = this.qubitCoordData[2 * q];
      let y = this.qubitCoordData[2 * q + 1];
      packedQubitCoords.push({ q, x, y });
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
      let { q: old_q, x, y } = packedQubitCoords[q];
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
