export const expected = {
  annotatedCircuit: {
    layers: [
      {
        operations: [
          // REPEAT 2 { H 0 }  → two ops, both line 5
          { op: 'H', targets: [0], line: 5 },
          { op: 'H', targets: [0], line: 5 },
        ],
        annotations: [
          // anchored highlight per iteration, both attach to the H (indices 0 and 1)
          { kind: 'Highlight', line: 4, opIndex: 0, style: { color: 'cyan' } },
          { kind: 'Highlight', line: 4, opIndex: 1, style: { color: 'cyan' } },

          // free-form CONN per iteration (two copies)
          { kind: 'ConnSet', line: 7, sheet: 'DEFAULT', edges: [[0,1]] },
          { kind: 'ConnSet', line: 7, sheet: 'DEFAULT', edges: [[0,1]] },

          // polygon header+body per iteration (two copies)
          {
            kind: 'Polygon',
            headerLine: 9,
            bodyLine: 10,
            sheet: 'DEFAULT',
            points: [[0,0],[0.5,0],[0.5,0.5],[0,0.5]],
          },
          {
            kind: 'Polygon',
            headerLine: 9,
            bodyLine: 10,
            sheet: 'DEFAULT',
            points: [[0,0],[0.5,0],[0.5,0.5],[0,0.5]],
          },
        ],
      },
    ],
  },
  diagnostics: [],
};
