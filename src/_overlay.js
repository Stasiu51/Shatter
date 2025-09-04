// Overlay parse / save helpers (Milestone 4 foundation).

/**
 * @typedef {{
 *  diagnostics: Array<{line:number, code:string, severity:'warning'|'error', message:string}>,
 *  hasTorusEmbedding: boolean,
 *  usedQubits: Set<number>,
 *  sheets: Array<{name:string, z:number}>,
 * }} Overlay
 */

const isBlank = (s) => !s || /^\s*$/.test(s);
const isComment = (s) => /^\s*#(?!!pragma)/.test(s);
const isPragma = (s) => /^\s*#!pragma\b/.test(s);
const isTick = (s) => /^\s*TICK\b/.test(s);
const gateNameRe = /^[A-Z][A-Z0-9_]*(?::[A-Z]+)?(?:\([^)]*\))?/;

function tokenize(line) {
  return line.trim().split(/\s+/);
}

function collectGateTargets(line) {
  // Very lightweight extraction of integer qubit ids following the gate name.
  const m = line.match(gateNameRe);
  if (!m) return null;
  const rest = line.slice(m[0].length).trim();
  if (!rest) return [];
  const ids = [];
  for (const tok of rest.split(/\s+/)) {
    if (/^rec\[/.test(tok)) continue; // ignore rec[...] references
    const v = parseInt(tok, 10);
    if (!Number.isNaN(v)) ids.push(v);
  }
  return ids;
}

function isGateLine(line) {
  if (isTick(line) || /^(\s*DETECTOR|\s*OBSERVABLE_INCLUDE|\s*REPEAT|\s*\})/.test(line)) return false;
  return gateNameRe.test(line);
}

function nextNonTrivia(lines, start) {
  for (let i = start; i < lines.length; i++) {
    const s = lines[i];
    if (isBlank(s) || isComment(s)) continue;
    return i;
  }
  return -1;
}

/**
 * Parse overlay directives and perform basic diagnostics.
 * - HL001: HIGHLIGHT GATE without next gate anchor
 * - HL002: HIGHLIGHT GATE QUBITS filter not subset of next gate's targets
 * - QU001: QUBIT without Q= not anchored to an instruction that mentions qubits
 * - QU002: QUBIT Q= references a qubit not present
 * - PR001: ##! POLY|MARK|ERR without immediate following #!pragma line (warning)
 * @param {string} text
 * @returns {Overlay}
 */
export function parseOverlayFromStim(text) {
  const lines = (text || '').split(/\r?\n/);
  const diagnostics = [];

  // Build a set of used qubits from QUBIT_COORDS and obvious gate/measurement lines.
  const usedQubits = new Set();
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (/^QUBIT_COORDS\(/.test(s)) {
      const m = s.match(/\)\s+(\d+)/);
      if (m) usedQubits.add(parseInt(m[1], 10));
      continue;
    }
    if (isComment(s) || isBlank(s) || isPragma(s)) continue;
    if (isGateLine(s) || /^M/.test(s)) {
      const ids = collectGateTargets(s) || [];
      ids.forEach(v => usedQubits.add(v));
    }
  }

  // Scan directives and produce diagnostics.
  let hasTorusEmbedding = false;
  let hasTorusLXLY = false;
  /** @type {Array<{name:string, z:number}>} */
  const sheets = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const s = raw.trim();
    if (!/^##!/.test(s)) continue;

    // EMBEDDING
    if (/^##!\s+EMBEDDING/i.test(s)) {
      if (/TYPE=TORUS/i.test(s)) {
        hasTorusEmbedding = true;
        hasTorusLXLY = /LX=\d+\s+LY=\d+/i.test(s);
      }
    }

    // SHEET declarations
    if (/^##!\s+SHEET\b/i.test(s)) {
      const nm = /\bNAME=([A-Za-z0-9_\-]+)/i.exec(s);
      const zm = /\bZ=(-?\d+)/i.exec(s);
      const name = nm ? nm[1] : `SHEET_${sheets.length}`;
      const z = zm ? parseInt(zm[1], 10) : 0;
      sheets.push({name, z: Number.isFinite(z) ? z : 0});
    }

    // QUBIT directives.
    if (/^##!\s+QUBIT/i.test(s)) {
      const hasQ = /Q=/.test(s);
      const nextIdx = nextNonTrivia(lines, i + 1);
      if (!hasQ) {
        // Must anchor to next instruction mentioning qubits.
        if (nextIdx === -1) {
          diagnostics.push({line: i + 1, code: 'QU001', severity: 'error', message: 'QUBIT without Q= not anchored (EOF).'});
        } else {
          const ns = lines[nextIdx].trim();
          const ids = collectGateTargets(ns) || [];
          if (ids.length === 0 && !/^QUBIT_COORDS\(/.test(ns)) {
            diagnostics.push({line: i + 1, code: 'QU001', severity: 'error', message: 'QUBIT without Q= not anchored to a qubit-mentioning instruction.'});
          }
        }
      } else {
        const m = s.match(/Q=(\d+)/);
        if (m) {
          const q = parseInt(m[1], 10);
          if (!usedQubits.has(q)) {
            diagnostics.push({line: i + 1, code: 'QU002', severity: 'error', message: `QUBIT Q=${q} does not exist in circuit.`});
          }
        }
      }
    }

    // HIGHLIGHT GATE semantics.
    if (/^##!\s+HIGHLIGHT\s+GATE/i.test(s)) {
      const nextIdx = nextNonTrivia(lines, i + 1);
      if (nextIdx === -1) {
        diagnostics.push({line: i + 1, code: 'HL001', severity: 'warning', message: 'HIGHLIGHT GATE not anchored (EOF).'});
      } else {
        const ns = lines[nextIdx].trim();
        if (!isGateLine(ns)) {
          diagnostics.push({line: i + 1, code: 'HL001', severity: 'warning', message: 'HIGHLIGHT GATE next non-trivia is not a gate.'});
        } else {
          const want = (() => {
            const m = s.match(/QUBITS=([\d,]+)/i);
            if (!m) return [];
            return m[1].split(',').map(v => parseInt(v.trim(), 10)).filter(v => v === v);
          })();
          if (want.length) {
            const got = collectGateTargets(ns) || [];
            const ok = want.every(q => got.includes(q));
            if (!ok) diagnostics.push({line: i + 1, code: 'HL002', severity: 'warning', message: 'HIGHLIGHT GATE qubit filter did not match next gate.'});
            for (const q of want) {
              if (!usedQubits.has(q)) diagnostics.push({line: i + 1, code: 'QU002', severity: 'error', message: `Unknown qubit in HIGHLIGHT GATE: Q=${q}`});
            }
          }
        }
      }
    }

    // Pairing checks for immediate pragma lines (skip POLY STYLE).
    const isPolyInstance = /^##!\s+POLY\b(?!\s+STYLE\b)/i.test(s);
    const isMarkInstance = /^##!\s+MARK\b/i.test(s);
    const isErrInstance  = /^##!\s+ERR\b/i.test(s);
    if (isPolyInstance || isMarkInstance || isErrInstance) {
      const next = lines[i + 1] ?? '';
      if (!/^\s*#!pragma\b/.test(next)) {
        diagnostics.push({line: i + 1, code: 'PR001', severity: 'warning', message: 'Directive missing immediate #!pragma pairing.'});
      }
    }
  }

  // No routing diagnostics: connections route according to the global embedding.

  return {
    diagnostics,
    hasTorusEmbedding: !!hasTorusEmbedding,
    usedQubits,
    sheets: sheets.sort((a, b) => a.z - b.z),
  };
}

/**
 * Ensure immediate #!pragma lines exist after POLY/MARK/ERR directives when requested.
 * This operates on raw text because overlay editing is not yet implemented.
 * @param {string} baseText
 * @param {{ ensurePragmas?: boolean }} opts
 * @returns {string}
 */
export function toStimCircuit(baseText, opts = {}) {
  const ensure = !!opts.ensurePragmas;
  if (!ensure) return baseText || '';
  const lines = (baseText || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    out.push(s);
    const t = s.trim();
    if (/^##!\s+POLY\b(?!\s+STYLE\b)/i.test(t)) {
      const next = lines[i + 1] || '';
      if (!/^\s*#!pragma\s+POLYGON/i.test(next)) {
        // Insert a minimal fallback pragma with no vertices and gentle color.
        out.push('#!pragma POLYGON(0.8,0.9,1.0,0.25)');
      }
    } else if (/^##!\s+MARK/i.test(t)) {
      const next = lines[i + 1] || '';
      if (!/^\s*#!pragma\s+MARK/i.test(next)) {
        out.push('#!pragma MARK');
      }
    } else if (/^##!\s+ERR/i.test(t)) {
      const next = lines[i + 1] || '';
      if (!/^\s*#!pragma\s+ERR/i.test(next)) {
        out.push('#!pragma ERR');
      }
    }
  }
  return out.join('\n');

}
