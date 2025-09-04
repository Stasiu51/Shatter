export const expected = {
  annotatedCircuit: {
    layers: [
      {
        operations: [
          { op: 'H', targets: [0], line: 4 },
        ],
        annotations: [],
      },
      {
        // TICK at line 9 would open, but it's empty; we drop trailing empty layers.
        operations: [],
        annotations: [],
      },
    ].filter(l => l.operations.length || l.annotations.length),
  },
  diagnostics: [
    {
      line: 3,
      code: 'POLY001',
      severity: 'error',
      message: '##! POLY must be immediately followed by "#! pragma POLYGON".',
    },
    {
      line: 7,
      code: 'POLY001',
      severity: 'error',
      message: '##! POLY must be immediately followed by "#! pragma POLYGON".',
    },
  ],
};
