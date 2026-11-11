# @texly/shared

Shared TypeScript types, Zod schemas, error codes, queue definitions, and API contracts for the Texly platform.

## Architecture

This package serves as the **single source of truth** across frontend, backend, workers, and compile runners:

- **`src/schemas/`**: Domain DTO schemas for Auth, Users, Workspaces, Projects, Files, Documents, Compilations, AI, and Versions.
- **`src/contracts/`**: Success and error response envelope helpers (`createSuccessEnvelopeSchema`, `ApiErrorEnvelopeSchema`).
- **`src/enums/`**: Shared domain enums (`ProjectRole`, `WorkspaceRole`, `Engine`, `BibTool`, `CompilationStatus`, `AIProposalStatus`, `EditOpType`, `VersionSource`, `SubscriptionPlan`).
- **`src/errors/`**: Standard API error codes registry (`ErrorCodeEnum`) and field-level validation schemas.
- **`src/events/`**: WebSocket event catalog for realtime notifications (`compilation.*`, `ai.proposal.updated`, `document.revision.changed`, `file.tree.changed`, `project.sync`).
- **`src/queues/`**: BullMQ job payload schemas for `compile` (`CompileJobV1`, `CompileResultV1`) and `ai-generate` (`AIGenerateJobV1`).
- **`src/pagination/`**: Cursor pagination input and response metadata schemas.
- **`src/ids/`**: UUIDv7 and domain ID brand schemas.
- **`src/openapi/`**: OpenAPI 3.1 generator (`generateOpenApiDocument()`).

## Available Scripts

- `pnpm --filter @texly/shared gen:openapi`: Generate OpenAPI 3.1 document (`dist/openapi.json` and `docs/openapi.json`).
- `pnpm --filter @texly/shared test`: Run shared schema and contract test suites.
- `pnpm --filter @texly/shared build`: Compile TypeScript declarations and distribution outputs.
