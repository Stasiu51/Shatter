export const expected = {
  annotatedCircuit: {
    layers: [
      {
        // outer iter #1
        operations: [
          { op: 'H', targets: [0], line: 3 },
          { op: 'H', targets: [1], line: 8 },
          { op: 'H', targets: [1], line: 8 },
          { op: 'H', targets: [1], line: 8 },
        ],
        annotations: [
          { kind: 'Highlight', line: 2, opIndex: 0, style: { color: 'lime' } },
          {
            kind: 'Polygon',
            headerLine: 6,
            bodyLine: 7,
            points: [[0,0],[0.2,0],[0.2,0.2],[0,0.2]],
          },
          {
            kind: 'Polygon',
            headerLine: 6,
            bodyLine: 7,
            points: [[0,0],[0.2,0],[0.2,0.2],[0,0.2]],
          },
          {
            kind: 'Polygon',
            headerLine: 6,
            bodyLine: 7,
            points: [[0,0],[0.2,0],[0.2,0.2],[0,0.2]],
          },
        ],
      },
      {
        // outer iter #2 (after TICK at line 10)
        operations: [
          { op: 'H', targets: [0], line: 3 },
          { op: 'H', targets: [1], line: 8 },
          { op: 'H', targets: [1], line: 8 },
          { op: 'H', targets: [1], line: 8 },
        ],
        annotations: [
          { kind: 'Highlight', line: 2, opIndex: 0, style: { color: 'lime' } },
          {
            kind: 'Polygon',
            headerLine: 6,
            bodyLine: 7,
            points: [[0,0],[0.2,0],[0.2,0.2],[0,0.2]],
          },
          {
            kind: 'Polygon',
            headerLine: 6,
            bodyLine: 7,
            points: [[0,0],[0.2,0],[0.2,0.2],[0,0.2]],
          },
          {
            kind: 'Polygon',
            headerLine: 6,
            bodyLine: 7,
            points: [[0,0],[0.2,0],[0.2,0.2],[0,0.2]],
          },
        ],
      },
    ],
  },
  diagnostics: [],
};
