export const expected = {
  annotatedCircuit: {
    layers: [
      {
        operations: [
          { op: 'H', targets: [0], line: 5 },
        ],
        annotations: [
          { kind: 'ConnSet', line: 4, sheet: 'DEFAULT', edges: [[0,1]] },
        ],
      },
    ],
  },
  diagnostics: [
    {
      line: 3,
      code: 'ANN001',
      severity: 'warning',
      message: 'Anchored annotation was not immediately followed by a crumble instruction and was cancelled.',
    },
  ],
};
