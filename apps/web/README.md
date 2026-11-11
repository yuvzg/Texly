# @texly/web

Next.js 16 frontend application for Texly.

## Tech Stack

- **Framework**: Next.js 16 App Router + React 19
- **Styling**: Tailwind CSS + shadcn/ui design tokens
- **Icons**: Lucide React
- **Editor**: CodeMirror 6 (integrated in Phase 3)
- **PDF Viewer**: PDF.js worker (integrated in Phase 6)

## Architectural Constraints

- **Strictly UI layer**: Contains zero business logic and no database connections.
- **Allowed package imports**: `@texly/shared` (DTOs, types) and `@texly/latex` (parsers/helpers).

