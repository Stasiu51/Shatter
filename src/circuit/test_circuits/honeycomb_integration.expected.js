export const expected = {
  annotatedCircuit: {
    layers: [
      {
        // LAYER 0
        operations: [
          // QUBIT_COORDS (lines 4–17)
          { op: 'QUBIT_COORDS', target: 0,  coords: [0.0, 0.0], line: 4 },
          { op: 'QUBIT_COORDS', target: 1,  coords: [1.0, 0.5], line: 5 },
          { op: 'QUBIT_COORDS', target: 2,  coords: [2.0, 0.0], line: 6 },
          { op: 'QUBIT_COORDS', target: 3,  coords: [3.0, 0.5], line: 7 },
          { op: 'QUBIT_COORDS', target: 4,  coords: [0.5, 1.0], line: 9 },
          { op: 'QUBIT_COORDS', target: 5,  coords: [1.5, 1.5], line: 10 },
          { op: 'QUBIT_COORDS', target: 6,  coords: [2.5, 1.0], line: 11 },
          { op: 'QUBIT_COORDS', target: 7,  coords: [3.5, 1.5], line: 12 },
          { op: 'QUBIT_COORDS', target: 8,  coords: [0.0, 2.0], line: 14 },
          { op: 'QUBIT_COORDS', target: 9,  coords: [1.0, 2.5], line: 15 },
          { op: 'QUBIT_COORDS', target: 10, coords: [2.0, 2.0], line: 16 },
          { op: 'QUBIT_COORDS', target: 11, coords: [3.0, 2.5], line: 17 },

          // H 0..11 (lines 31–42)
          { op: 'H', targets: [0],  line: 31 },
          { op: 'H', targets: [1],  line: 32 },
          { op: 'H', targets: [2],  line: 33 },
          { op: 'H', targets: [3],  line: 34 },
          { op: 'H', targets: [4],  line: 35 },
          { op: 'H', targets: [5],  line: 36 },
          { op: 'H', targets: [6],  line: 37 },
          { op: 'H', targets: [7],  line: 38 },
          { op: 'H', targets: [8],  line: 39 },
          { op: 'H', targets: [9],  line: 40 },
          { op: 'H', targets: [10], line: 41 },
          { op: 'H', targets: [11], line: 42 },

          // highlighted gate (lines 44–45)
          { op: 'CX', targets: [0,1], line: 45 },

          // mark (line 54)
          { op: 'MARK', axis: 'X', target: 5, line: 54 },
        ],
        annotations: [
          { kind: 'Sheet', line: 20, name: 'DEFAULT', z: 0 },
          {
            kind: 'ConnSet',
            line: 22,
            sheet: 'DEFAULT',
            edges: [
              [0,1],[1,2],[2,3],
              [4,5],[5,6],[6,7],
              [8,9],[9,10],[10,11],
              [0,4],[1,5],[2,6],[3,7],
              [4,8],[5,9],[6,10],[7,11],
            ],
          },
          { kind: 'Highlight', line: 44, opIndex: 24, style: { color: 'gold' } },
          {
            kind: 'Polygon',
            headerLine: 48,
            bodyLine: 49,
            sheet: 'DEFAULT',
            stroke: 'orange',
            fill: 'none',
            points: [[1.0,1.0],[1.5,1.25],[2.0,1.0],[2.0,0.5],[1.5,0.25],[1.0,0.5]],
          },
          {
            kind: 'Polygon',
            bodyLine: 52,
            points: [[2.0,1.5],[2.5,1.75],[3.0,1.5],[3.0,1.0],[2.5,0.75],[2.0,1.0]],
          },
        ],
      },
      {
        // LAYER 1 (after TICK at 56)
        operations: [
          { op: 'CX', targets: [2,3],   line: 60 },
          { op: 'CX', targets: [4,5],   line: 62 },
          { op: 'CX', targets: [6,7],   line: 63 },
          { op: 'CX', targets: [8,9],   line: 64 },
          { op: 'CX', targets: [10,11], line: 65 },
        ],
        annotations: [
          { kind: 'Highlight', line: 59, opIndex: 0, style: { color: 'cyan' } },
          {
            kind: 'Polygon',
            headerLine: 68,
            bodyLine: 69,
            sheet: 'DEFAULT',
            stroke: 'deepskyblue',
            fill: 'none',
            points: [[0.5,1.5],[1.0,1.75],[1.5,1.5],[1.5,1.0],[1.0,0.75],[0.5,1.0]],
          },
        ],
      },
      {
        // LAYER 2 (after TICK at 71)
        operations: [
          { op: 'H',  targets: [6],    line: 75 },
          { op: 'CX', targets: [1,5],  line: 77 },
          { op: 'CX', targets: [5,9],  line: 78 },
          { op: 'CX', targets: [9,10], line: 79 },
          { op: 'MARK', axis: 'Z', target: 10, line: 80 },
        ],
        annotations: [
          { kind: 'Highlight', line: 74, opIndex: 0, style: { color: 'lime' } },
          {
            kind: 'Polygon',
            bodyLine: 83,
            points: [[3.0,2.0],[3.5,2.25],[4.0,2.0],[4.0,1.5],[3.5,1.25],[3.0,1.5]],
          },
        ],
      },
    ],
  },
  diagnostics: [],
};
