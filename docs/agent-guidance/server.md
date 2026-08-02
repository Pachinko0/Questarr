# Server Guidance

Apply this guidance to changes under `server/` and to shared code that affects server behavior.

## Architecture and Placement

- `server/index.ts` owns startup order: migrations, default data, integration configuration, route
  registration, Socket.io, HTTP/HTTPS listeners, and cron startup.
- `server/app.ts` owns shared Express middleware and request logging.
- `server/routes.ts` is the legacy route hub. Prefer a focused router under `server/routes/` for a
  new cohesive domain, mounted behind the global authentication boundary.
- Put reusable orchestration in `server/services/`; keep route handlers focused on validation,
  authorization, service calls, and response mapping.
- Application persistence goes through `IStorage` in `server/storage.ts`. Direct `db` access is
  reserved for database infrastructure such as migrations and readiness checks.
- Use shared schemas and types from `shared/` rather than defining drifting request or domain shapes.

## Authentication and Ownership

- Routes registered after the global `app.use("/api", authenticateToken)` boundary inherit JWT
  authentication. Routes mounted before it must declare authentication explicitly.
- Never treat authentication as ownership. Verify that the requested game, download, notification,
  import task, or file belongs to `req.user` before reading or mutating it.
- Games and user settings are user-scoped. Indexers, downloaders, path mappings, and platform
  mappings are currently global configuration; do not silently change that model.
- Socket.io events are currently broadcast globally. Do not place new secrets or private user data
  in socket payloads; note the lack of per-user rooms when adding events.

## Security Boundaries

- Route input must be validated with the existing Zod schemas, `express-validator` middleware, or a
  narrowly scoped new schema. Return structured 4xx errors for invalid input.
- All user-configurable outbound HTTP(S) requests must use the protections in `server/ssrf.ts`.
  Preserve redirect validation, DNS/IP checks, timeouts, and explicit private-network decisions.
- Store indexer and downloader secrets through the existing credential-encryption path. Responses
  must mask stored credentials, and unchanged mask sentinels must preserve the existing value.
- Never log passwords, API keys, JWTs, webhook URLs containing secrets, or raw authorization headers.
- For filesystem operations, resolve paths, enforce containment, reject sensitive paths, and account
  for symlinks. Do not trust release names or downloader-reported paths.
- Archive extraction and deletion are destructive boundaries. Keep targets explicit, contained, and
  covered by tests for traversal and cleanup behavior.

## Storage and Data Behavior

- Add persistence behavior to `IStorage`, `MemStorage`, and `DatabaseStorage` together.
- Keep memory and database implementations behaviorally equivalent; many route tests rely on
  `MemStorage`, while integration tests exercise SQLite.
- Preserve per-user filtering in queries. A global lookup such as an IGDB ID match must not expose or
  mutate another user's record accidentally.
- Batch related writes when practical and use transactions for operations that must be atomic.
- Avoid changing status transitions casually. Game, download, and import statuses drive cron,
  notifications, UI actions, and post-processing eligibility.

## Indexers and Downloaders

- Indexer search is normalized through `server/search.ts`; protocol-specific behavior belongs in
  the Torznab, Newznab, G4U, or Prowlarr modules.
- A new downloader must implement `DownloaderClient`, be registered in
  `server/downloaders/manager.ts`, be classified in `shared/downloader-types.ts`, be exported from
  `server/downloaders/index.ts`, and include contract-focused tests.
- Preserve torrent/Usenet compatibility filtering and downloader priority/fallback behavior.
- Use downloader-reported identifiers consistently. Queue-to-history transitions and temporary
  disappearance must not be treated as definitive failure or completion without the existing guards.

## Cron, Notifications, and Imports

- Cron jobs run in the application process and may overlap if a previous run is slow. Make new work
  idempotent and avoid duplicate downloads or notifications.
- Background operations must isolate per-item failures so one integration does not abort the batch.
- The import pipeline is path-sensitive. Preserve remote-to-local mapping, library-root containment,
  manual-review states, transfer-mode behavior, and cleanup on partial failure.
- Hardlink, copy, move, and symlink behavior must remain explicit. Do not convert one mode into
  another silently except where an existing documented fallback requires it.
- Record imported files through storage and keep `libraryPath`, game status, download status, and
  import history consistent.

## Verification

Run the closest server tests first, followed by TypeScript checking. For storage, routes, cron,
authentication, downloader, or import changes, run the full suite before handoff.

Useful test areas include:

- `server/__tests__/api_routes*.test.ts`
- `server/__tests__/storage*.test.ts`
- `server/__tests__/cron_*.test.ts`
- `server/__tests__/downloaders*.test.ts`
- `server/__tests__/import_*.test.ts`
- `server/__tests__/security*.test.ts` and `server/__tests__/ssrf*.test.ts`
