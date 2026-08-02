# Questarr Agent Guidance

Questarr is a single-package TypeScript application for discovering, tracking, downloading, and
post-processing games. The React SPA lives in `client/`, the Express API and background jobs live
in `server/`, and shared Drizzle/Zod models live in `shared/`.

## Load Guidance for the Current Task

Before editing a domain, read its guidance file. Load only the files relevant to the task.

- Backend, API, integrations, storage, cron, security, or import work:
  `docs/agent-guidance/server.md`
- React UI, client state, routing, accessibility, or frontend tests:
  `docs/agent-guidance/client.md`
- Database schema, migrations, snapshots, or data-repair scripts:
  `docs/agent-guidance/migrations.md`

When a task crosses domains, read every applicable guidance file.

## Sources of Truth

- `shared/schema.ts`: database tables, shared domain types, and validation schemas
- `server/index.ts`: process startup and service initialization order
- `server/routes.ts` and `server/routes/`: HTTP interface and orchestration
- `server/storage.ts`: application persistence contract and implementations
- `client/src/App.tsx`: client routes and application shell
- `docs/ARCHITECTURE.md`: intended system boundaries; verify details against code because the
  document may lag recent implementation
- `docs/API.md`: intended external API contract; verify endpoints against route registration

## Working Rules

- Preserve all pre-existing working-tree changes. Never discard or overwrite unrelated user work.
- Keep changes scoped to the request. Do not opportunistically reformat or refactor unrelated code.
- Use TypeScript strictness and avoid introducing `any` or unchecked type assertions.
- Never commit credentials, print secrets, or replace masked credentials with placeholder values.
- Add or update regression tests for behavior changes and bug fixes.
- Use existing abstractions and conventions before introducing new dependencies or parallel systems.
- Treat security boundaries as product behavior: authentication, user ownership, SSRF protection,
  path containment, credential encryption, and archive handling must not be weakened.

## Commands and Verification

Use `rtk` as a command prefix when it is installed. If `rtk` is unavailable, run the underlying
command directly. On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd`.

Use the narrowest relevant verification:

```bash
npx vitest run path/to/relevant.test.ts
npm run check
npm run lint
npm test
npm run build
```

- Do not rerun tests after every edit. Run the narrowest relevant test once at the end of a
  substantial change.
- Run `npm run check` for every TypeScript change.
- Never run the full test suite unless the user explicitly requests it.
- Ask before starting any validation expected to take longer than 30 seconds.
- Run the production build when changing bundling, startup, shared imports, or deployment behavior.
- Report which checks were run or skipped and distinguish failures from pre-existing warnings.

## Completion Expectations

Before handing off an implementation:

1. Review the final diff for accidental or unrelated changes.
2. Confirm new routes and persistence operations enforce authentication and ownership correctly.
3. Confirm outbound requests and filesystem paths stay within their security boundaries.
4. Confirm migrations and shared types remain backward-compatible where required.
5. Summarize changed behavior, verification evidence, and any remaining risk.
