# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is SnapOtter

Open-source, self-hostable image manipulation suite (51 tools). Single Docker container, no external services. Dual-licensed AGPLv3 / commercial.

## Monorepo Layout

```
apps/web/         # Main React SPA (port 1349)
apps/api/         # Fastify API server (port 13490)
apps/landing/     # Marketing site (Vite + React, deployed to Cloudflare Pages)
apps/docs/        # VitePress documentation site (deployed to Cloudflare Pages)
packages/shared/  # Constants, types, i18n, permissions -- consumed by all apps
packages/image-engine/  # Sharp-based image processing pipeline
packages/ai/      # Python sidecar bridge for ML models
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS 4, Zustand, react-router-dom v7 |
| Backend | Fastify 5, tsx (no compile step in dev), Sharp |
| Database | SQLite via Drizzle ORM (better-sqlite3) |
| AI/ML | Python sidecar (rembg, RealESRGAN, PaddleOCR, MediaPipe, LaMa) |
| Docs | VitePress |
| Testing | Vitest (unit/integration), Playwright (e2e) |
| CI/CD | GitHub Actions, semantic-release, Docker multi-arch |
| Linting | Biome (format + lint in one pass) |

## Commands

```bash
pnpm dev                  # Start all dev servers (web on :1349, api on :13490)
pnpm build                # Build all workspaces (turbo, packages first)
pnpm typecheck            # TypeScript check across monorepo
pnpm lint                 # Biome lint + format check
pnpm lint:fix             # Biome auto-fix
pnpm test                 # All Vitest tests (unit + integration)
pnpm test:unit            # Unit tests only
pnpm test:integration     # Integration tests only (full API)
pnpm test:e2e             # Playwright e2e tests (main app)
pnpm test:e2e:landing     # Playwright e2e tests (landing site)
pnpm test:e2e:docs        # Playwright e2e tests (docs site)
pnpm test:coverage        # Tests with V8 coverage report

# Run a single test file
pnpm vitest run tests/unit/my-test.test.ts
pnpm vitest run tests/integration/my-test.test.ts

# Run a single e2e spec
pnpm playwright test tests/e2e/my-test.spec.ts

# Database migrations (run from apps/api/)
cd apps/api && npx drizzle-kit generate   # Generate from schema changes
cd apps/api && npx drizzle-kit migrate    # Apply pending migrations
```

## Key Conventions

- **Simplicity over complexity** -- do not over-engineer
- **Double quotes**, **semicolons**, **2-space indent** (enforced by Biome)
- **ES modules** in all workspaces (`"type": "module"`)
- Conventional commits for semantic-release (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- Zod for all API input validation
- i18n strings in `packages/shared/src/i18n/en.ts` (reference locale, ~1500 keys)
- All user-facing strings use `useTranslation()` hook from `apps/web/src/contexts/i18n-context.tsx`
- Use `t.section.key` for string references, `format(t.key, { var })` for interpolation, `plural(n, one, other)` for pluralization
- Tailwind uses logical properties for RTL support (`ms-` not `ml-`, `text-start` not `text-left`)
- 21 supported languages. Adding a new locale: create `packages/shared/src/i18n/<code>.ts` typed as `TranslationKeys`, add to `SUPPORTED_LOCALES` in `index.ts`

## Architecture: How a Tool Works

A "tool" is defined in three places that share the same `toolId` string:

1. **Shared metadata** (`packages/shared/src/constants.ts`) -- `TOOLS[]` array with id, name, description, category, icon, route. Single source of truth for tool metadata consumed by both frontend and backend.

2. **API route** (`apps/api/src/routes/tools/<toolId>.ts`) -- Processing logic. Most tools use the `createToolRoute` factory (`apps/api/src/routes/tool-factory.ts`), which handles multipart parsing, file validation, format decoding (HEIC/RAW/PSD), SVG sanitization, EXIF auto-orientation, Zod settings validation, output saving, preview generation, file versioning, and analytics. A simple tool is ~30 lines: a Zod schema + a process function that calls `@snapotter/image-engine`. Routes are registered in `apps/api/src/routes/tools/index.ts`.

3. **Frontend settings** (`apps/web/src/components/tools/<toolId>-settings.tsx`) -- UI component for the tool's settings panel. Registered in `apps/web/src/lib/tool-registry.tsx` with a `displayMode` (side-by-side, before-after, live-preview, interactive-crop, interactive-eraser, no-dropzone, custom-results).

### Adding a New Tool

1. Add tool definition to `TOOLS[]` in `packages/shared/src/constants.ts`
2. Create `apps/api/src/routes/tools/<toolId>.ts` -- export a `register<Tool>(app)` function that calls `createToolRoute(app, { toolId, settingsSchema, process })`
3. Add to the registration array in `apps/api/src/routes/tools/index.ts`
4. Create `apps/web/src/components/tools/<toolId>-settings.tsx`
5. Add lazy import + registry entry in `apps/web/src/lib/tool-registry.tsx`
6. Add i18n strings in `packages/shared/src/i18n/en.ts`

### Request Lifecycle

**Standard tools**: Frontend sends `POST /api/v1/tools/:toolId` (multipart with file + JSON settings) via XHR with upload progress. The `createToolRoute` factory processes and returns `{jobId, downloadUrl, originalSize, processedSize}`.

**AI tools**: Do NOT use `createToolRoute` for their HTTP route. They return `202 Accepted` immediately, process asynchronously via the Python sidecar, and stream progress via SSE (`EventSource` on `/api/v1/jobs/:jobId/progress`). They still register a sync wrapper via `registerToolProcessFn()` for pipeline/batch reuse.

### Pipeline System

Pipelines chain tools: each step's output buffer feeds the next step's input. The tool registry (`toolRegistry` Map) enables pipelines and batch processing to call any registered tool's process function without duplicating logic. CRUD stored in `pipelines` DB table as JSON. Batch processing uses `p-queue` concurrency and returns a ZIP via `archiver`.

## AI Sidecar (packages/ai/)

Two-tier Python execution:

1. **Persistent dispatcher** (primary): Long-lived Python process (`packages/ai/python/dispatcher.py`) communicating via JSON over stdio. Node sends `{id, script, args}` on stdin, Python responds `{id, stdout, exitCode}` on stdout. Progress events stream on stderr as `{progress, stage}`. Pre-imports heavy ML libraries at startup to eliminate cold-start latency. Auto-restarts after 50 requests to prevent memory leaks.

2. **Per-request fallback**: Fresh Python process per request if dispatcher is unavailable. Exponential backoff with crash recovery (5 crashes in 60s = permanent disable).

AI tools require model bundles defined in `packages/shared/src/features.ts` (`FEATURE_BUNDLES`). The API checks `isToolInstalled()` before processing; the frontend shows an install prompt if not installed.

## Image Engine (packages/image-engine/)

`processImage(input, operations[], outputFormat?)` pipes a buffer through named operations. Each operation is a pure function `(Sharp, options) => Promise<Sharp>`. The `OPERATION_MAP` in `engine.ts` dispatches by string key. Individual operations are also exported for direct use by API routes.

## Auth and Permissions

Session-based auth with scrypt password hashing. Three built-in roles (`admin`, `editor`, `user`) with 14 granular permissions defined in `packages/shared/src/permissions.ts`. Custom roles stored in `roles` table. API keys (prefixed `si_`) carry optional scoped permissions that intersect with user role permissions. Auth can be disabled entirely (synthetic anonymous user with `user` role).

## Frontend State

14 Zustand stores in `apps/web/src/stores/`. The central one is `file-store.ts` managing `FileEntry[]` with blob URLs, processing status, and batch ZIP. Key hooks: `use-tool-processor.ts` (single-file XHR + batch + SSE progress) and `use-pipeline-processor.ts`.

All page components are `lazy()`-loaded. The key route is `/:toolId` rendering `ToolPage` (`apps/web/src/pages/tool-page.tsx`), which looks up metadata from shared constants and the frontend tool registry.

## Database

SQLite via Drizzle ORM. Schema: `apps/api/src/db/schema.ts`. Migrations in `apps/api/drizzle/`.

Tables: users, teams, sessions, settings (key-value), jobs, apiKeys, pipelines, auditLog, roles, userFiles.

## Testing

- `tests/unit/` -- Vitest unit tests
- `tests/integration/` -- Vitest integration tests (one per tool/feature, full API)
- `tests/e2e/` -- Playwright specs (Chromium primary, Firefox/WebKit for cross-browser)
- `tests/fixtures/` -- Small test images in various formats

Vitest uses single-fork pool (shared SQLite connection), 30s timeouts, and injects test env vars. Playwright auth setup project logs in and saves storage state; spins up both dev servers with a fresh test DB.

## Pre-commit Hooks

Husky + lint-staged runs `biome check --write` on staged `*.{ts,tsx,js,jsx,json}` files before every commit. If a commit fails, fix the lint issues rather than bypassing the hook.

## Do Not Modify Config Files

Biome, TypeScript, and editor config files are protected by hooks. Fix the code to satisfy the linter/compiler, not the other way around. This prevents a common AI failure mode where rules get weakened instead of code getting fixed.

## Model Routing for Subagents

Always use **Opus 4.7, Max Effort, 1M context** for every agent and subagent. No exceptions. No model downgrading.

## Strategic Compaction

When context gets large, compact at logical phase boundaries:

- **Good times to compact**: After research and before planning. After debugging and before implementing the fix. After completing a major feature.
- **Bad times to compact**: Mid-implementation. While actively debugging. During a multi-step refactor.
- **Survives compaction**: This CLAUDE.md, active tasks, git state, memory files
- **Lost on compaction**: Intermediate reasoning, file contents previously read, conversation flow
