// valid_basic.expected.js
// NOTE: Adjust the import paths below to match your repo layout.
import {Operation} from "../operation.js";
import {GATE_MAP} from "../../gates/gateset.js";

const H  = GATE_MAP.get('H');
const CX = GATE_MAP.get('CX');

// Helper to build an Operation inline and set its source line #
const Op = (gate, targets, line) =>
  Object.assign(new Operation(gate, "", new Float32Array([]), new Uint32Array(targets)), { line });

export const expected = {
  annotatedCircuit: {
    layers: [
      {
        annotations: [
          { kind: 'Sheet', line: 3, name: 'DEFAULT', z: 0 },
        ],
        operations: [
          Op(H,  [0],    4),
          Op(CX, [0, 1], 5),
        ],
      },
      {
        annotations: [
          { kind: 'GateHighlight', line: 8, opIndex: 0, color: 'yellow' },
          { kind: 'ConnSet',       line: 11, sheet: 'DEFAULT', edges: [[0, 1]], droop: undefined },
          {
            kind: 'Polygon',
            headerLine: 13,
            bodyLine:   14,
            sheet: 'DEFAULT',
            stroke: 'black',
            fill: 'none',
            points: [
              [1, 1],
              [1.5, 1.25],
              [2, 1],
              [2, 0.5],
              [1.5, 0.25],
              [1, 0.5],
            ],
          },
          {
            kind: 'Polygon',
            bodyLine: 17, // header synthesized elsewhere (defaults)
            sheet: 'DEFAULT',
            stroke: 'black',
            fill: 'none',
            points: [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
            ],
          },
        ],
        operations: [
          Op(H, [2], 9),
        ],
      },
    ],
    // Present in parser output even if empty; include to match deep equality
    qubit_coords: new Map(),
  },
  // The current parser reports a parse error for: ERR "note about qubit"
  // If you remove that line from valid_basic.stim or extend the crumble parser to accept it,
  // update diagnostics accordingly.
  diagnostics: [
  ],
};
