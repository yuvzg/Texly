/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-packages-importing-apps',
      comment: 'Packages must never import from apps',
      severity: 'error',
      from: { path: '^packages' },
      to: { path: '^apps' },
    },
    {
      name: 'compile-runner-forbidden-packages',
      comment:
        'apps/compile-runner may only import packages/shared and packages/latex. It must never import packages/db, packages/llm, etc.',
      severity: 'error',
      from: { path: '^apps/compile-runner' },
      to: { path: '^packages/(db|llm)' },
    },
    {
      name: 'web-forbidden-packages',
      comment:
        'apps/web may only import packages/shared and packages/latex. It must never import packages/db or packages/llm.',
      severity: 'error',
      from: { path: '^apps/web' },
      to: { path: '^packages/(db|llm)' },
    },
    {
      name: 'shared-pure-boundary',
      comment: 'packages/shared must not import from other internal packages or apps',
      severity: 'error',
      from: { path: '^packages/shared' },
      to: { path: '^packages/(db|latex|llm)' },
    },
    {
      name: 'latex-pure-boundary',
      comment: 'packages/latex may only import packages/shared',
      severity: 'error',
      from: { path: '^packages/latex' },
      to: { path: '^packages/(db|llm)' },
    },
    {
      name: 'llm-boundary',
      comment: 'packages/llm may only import packages/shared and packages/latex; never packages/db',
      severity: 'error',
      from: { path: '^packages/llm' },
      to: { path: '^packages/db' },
    },
    {
      name: 'db-boundary',
      comment: 'packages/db may only import packages/shared; never packages/latex or packages/llm',
      severity: 'error',
      from: { path: '^packages/db' },
      to: { path: '^packages/(latex|llm)' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};
