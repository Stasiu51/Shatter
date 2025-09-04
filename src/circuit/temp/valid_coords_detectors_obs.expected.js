export const expected = {
  annotatedCircuit: {
    layers: [
      {
        operations: [
          { op: 'QUBIT_COORDS', target: 0, coords: [0,0], line: 1 },
          { op: 'QUBIT_COORDS', target: 1, coords: [1,0], line: 2 },
          { op: 'H',  targets: [0],     line: 3 },
          { op: 'CX', targets: [0, 1],  line: 4 },
          { op: 'DETECTOR', recs: [-1, -2], line: 8 },
          { op: 'OBSERVABLE_INCLUDE', index: 0, recs: [-1], line: 9 },
        ],
        annotations: [
          { kind: 'ConnSet', line: 6, sheet: 'DEFAULT', edges: [[0,1]] },
        ],
      },
      // TICK at 15 opens an empty layer; drop it.
    ],
  },
  diagnostics: [],
};
