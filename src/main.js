import {parseOverlayFromStim, toStimCircuit} from './overlay.js';
// For now, import directly from upstream reference for functionality.
import {Circuit} from '../core/circuit/circuit.js';
import {PropagatedPauliFrames} from '../core/circuit/propagated_pauli_frames.js';
import {describeCircuit, describePropagation} from './view.js';

const elStim = document.getElementById('stim');
const elOut = document.getElementById('out');
const btnParse = document.getElementById('btn-parse');
const btnPropagate = document.getElementById('btn-propagate');
const elMarker = document.getElementById('marker');

const sample = `
QUBIT_COORDS(0, 0) 0
QUBIT_COORDS(1, 0) 1
R 0
H 0
CX 0 1
MX 0
`;

elStim.value = sample.trim() + '\n';

btnParse.addEventListener('click', () => {
  try {
    const overlay = parseOverlayFromStim(elStim.value);
    const text = toStimCircuit(elStim.value, overlay, { ensurePragmas: false });
    const circuit = Circuit.fromStimCircuit(text);
    elOut.textContent = describeCircuit(circuit) + '\n\n' + circuit.toStimCircuit();
  } catch (err) {
    elOut.textContent = 'Parse error: ' + err;
  }
});

btnPropagate.addEventListener('click', () => {
  try {
    const circuit = Circuit.fromStimCircuit(elStim.value);
    const idx = Number(elMarker.value) || 0;
    const propagated = PropagatedPauliFrames.fromCircuit(circuit, idx);
    elOut.textContent = describePropagation(propagated);
  } catch (err) {
    elOut.textContent = 'Propagate error: ' + err;
  }
});
