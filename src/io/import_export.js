// Minimal import/export helpers for Stim circuits (browser-side, ESM).
// Uses our AnnotatedCircuit for parsing/printing.

import {AnnotatedCircuit} from '../circuit/annotated_circuit.js';
import {toPragmaStim} from './pragma_export.js';

export function parseStim(text) {
  // Parse via AnnotatedCircuit to validate and normalize.
  const parsed = AnnotatedCircuit.parse(text || '');
  return { circuit: parsed.circuit, text: parsed.text, diagnostics: parsed.diagnostics || [] };
}

export function stringifyStim(circuit) {
  if (!circuit) return '';
  try {
    return toPragmaStim(circuit);
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
