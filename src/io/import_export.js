// Minimal import/export helpers for Stim circuits (browser-side, ESM).
// Uses the vendored Crumble Circuit for parsing/printing.

import {Circuit} from '../../stim_crumble/circuit/circuit.js';

export function parseStim(text) {
  // Parse via Crumble to validate and normalize, capturing warnings emitted via console.warn.
  const warnings = [];
  const prevWarn = console.warn;
  try {
    console.warn = (msg, ...rest) => {
      try {
        const s = String(msg) + (rest.length ? ' ' + rest.map(String).join(' ') : '');
        warnings.push(s);
      } catch {
        // ignore formatting failures
      }
      // Still forward to the real console for dev visibility.
      prevWarn.call(console, msg, ...rest);
    };
    const circuit = Circuit.fromStimCircuit(text || '');
    const normalized = circuit.toStimCircuit();
    return {circuit, text: normalized, warnings};
  } finally {
    console.warn = prevWarn;
  }
}

export function stringifyStim(circuit) {
  if (!circuit) return '';
  try {
    return circuit.toStimCircuit();
  } catch {
    return '';
  }
}

export async function pickAndReadFile({accept='.stim,.txt'} = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      const text = await f.text();
      resolve({name: f.name, text});
    };
    input.click();
  });
}

export function downloadText(filename, text) {
  const blob = new Blob([text], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'circuit.stim';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
