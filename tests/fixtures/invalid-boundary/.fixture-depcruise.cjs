module.exports = {
  forbidden: [
    {
      name: 'compile-runner-forbidden-packages',
      comment: 'Deliberate test violation rule',
      severity: 'error',
      from: { path: 'invalid-runner\\.ts$' },
      to: { path: 'packages/db' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
  },
};
