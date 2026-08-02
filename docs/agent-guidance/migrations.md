# Schema and Migration Guidance

Apply this guidance to `shared/schema.ts`, `migrations/`, `drizzle.config.ts`, and database repair or
conversion scripts.

## Source and Generation Rules

- `shared/schema.ts` is the source of truth for the current SQLite schema and shared inferred types.
- Use Drizzle generation for normal schema changes:

  ```bash
  npm run db:generate
  ```

- A schema change normally includes the generated SQL migration, matching metadata snapshot, and
  `_journal.json` entry.
- Review generated SQL before accepting it. Confirm defaults, nullability, foreign-key actions,
  indexes, and data preservation match the intended rollout.
- Treat historical migrations as immutable release history. Do not edit an older migration unless
  the task explicitly requires repairing migration history and includes compatibility evidence.
- Never use `db:push` as a substitute for a committed migration.

## Compatibility

- SQLite is the production default. Keep generated SQL compatible with the supported SQLite version
  and the `better-sqlite3` migration runner.
- Existing installations may upgrade across many versions. Migrations must work against realistic
  older schemas, not only a freshly generated database.
- Adding a non-null column to a populated table requires a safe default or an explicit backfill.
- Table rebuilds must preserve data, indexes, foreign keys, and cascade behavior.
- Keep JSON and timestamp modes consistent between the Drizzle declaration, stored representation,
  migration SQL, and repair scripts.
- Schema changes affecting API payloads require corresponding Zod schemas, shared types, storage
  methods, client handling, and tests.

## Data Repair Scripts

- Repair scripts must default to the configured database path and clearly report their target.
- Prefer a dry-run or preview mode for broad updates.
- Make repairs idempotent when possible and avoid touching already-correct rows.
- Wrap related mutations in a transaction and print counts rather than sensitive row contents.
- Never delete or rewrite a user's database backup automatically.

## Verification

For a migration change:

1. Inspect the generated SQL and metadata diff.
2. Run migration tests, especially `server/__tests__/migrate.test.ts` and database integration tests.
3. Test both a fresh database and an upgrade fixture when the change affects existing tables.
4. Run storage/schema tests and `npm run check`.
5. Confirm the application starts with migrations applied exactly once.

Do not regenerate unrelated migrations or snapshots merely to reduce diff noise.
