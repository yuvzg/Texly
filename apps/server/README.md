# @texly/server

Modular monolith backend for Texly providing REST APIs, realtime updates, and background workers.

## Entrypoints

- `src/entrypoints/api.ts`: API HTTP server (`createApp`)
- `src/entrypoints/worker.ts`: BullMQ background job worker

## Architecture

- Layered architecture: `Routes -> Controllers -> Services -> Repositories`
- Pino JSON structured logging with field-level redaction
- Zod-validated environment configuration
- Request ID propagation via `x-request-id`
