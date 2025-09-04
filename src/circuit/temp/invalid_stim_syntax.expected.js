export const expected = {
  annotatedCircuit: {
    layers: [
      { operations: [], annotations: [] },
    ].filter(l => l.operations.length || l.annotations.length),
  },
  diagnostics: [
    { line: 2, code: 'PAR003', severity: 'error', message: 'Bad crumble syntax.' },
  ],
};