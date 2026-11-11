# @texly/compile-runner

Isolated compilation runner service for executing LaTeX jobs in secure sandboxes.

## Security Constraints

- **Zero Credentials**: Has no access to database, R2 root credentials, or LLM API keys.
- **Dependency Boundary**: May import only `@texly/shared` and `@texly/latex`.
- Communicates only via Redis queue jobs and presigned URLs.

