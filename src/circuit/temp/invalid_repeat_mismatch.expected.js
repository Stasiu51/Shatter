export const expected = {
  annotatedCircuit: {
    layers: [
      {
        operations: [
          { op: 'H', targets: [0], line: 3 },
        ],
        annotations: [],
      },
    ],
  },
  diagnostics: [
    { line: 2, code: 'REP001', severity: 'error', message: 'Unmatched }' },
    { line: 6, code: 'REP002', severity: 'error', message: 'Unclosed REPEAT block' },
  ],
};
