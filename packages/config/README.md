# @texly/config

Shared configuration presets for the Texly monorepo.

## Provided Configurations

- **TypeScript (`tsconfig/`)**:
  - `base.json`: Base configuration enforcing strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`.
  - `library.json`: Library preset with declaration and source map generation.
  - `backend.json`: Backend Node.js 24 + Express 5 runtime preset.
  - `frontend.json`: Next.js 16 App Router preset.
- **Prettier (`prettier/`)**:
  - Prettier formatting rules per `CODING_STANDARDS.md`.

