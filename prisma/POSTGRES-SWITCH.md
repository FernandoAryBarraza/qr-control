# Postgres switch — dry run (D1)

> 🚧 **Out-of-change: this is a dry run.** No step below has been executed against a
> real PostgreSQL server as part of this change (task 4.6 scopes execution explicitly
> out). What _is_ verified now is the guardrail every step ends with: `npm run db:verify`,
> covered by `src/server/data/db-verify.int.spec.ts`.

Design reference: `openspec/changes/persistence-prisma-sqlite/design.md` §9
("Postgres switch mechanics — executed later, verified now").

## Preconditions

- `npm run test:all`, `npx tsc --noEmit -p tsconfig.app.json` and `ng build` are green.
- A reachable PostgreSQL server and credentials.
- Clean working tree (`git status`), so the whole switch stays one revertible diff.

## Steps

### 1. Swap the provider literal

`prisma/schema.prisma`:

```prisma
datasource db {
  provider = "sqlite" // → "postgresql" — one literal, nothing else in this block
}
```

After this edit `npm run db:verify` **fails loudly** (schema provider ≠ `DATA_PROVIDER`).
That failure is the intended signal: steps 1–3 must land together.

### 2. Swap `DATABASE_URL`, `DATA_PROVIDER` and the driver adapter

`.env`:

```env
DATABASE_URL="postgresql://user:pass@host:5432/qr_control"
```

`src/server/data/config.ts`: `DATA_PROVIDER = 'sqlite'` → `'postgresql'`. It must move
with the schema literal — `db:verify` fails on any drift between the two.

`src/server/data/prisma-client.ts`: Prisma 7 requires a driver adapter, so install the
Postgres one and swap the import (the comment at the top of that file records this as
the single runtime call site):

```bash
npm i @prisma/adapter-pg
```

```ts
import { PrismaPg } from '@prisma/adapter-pg';
// …
const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
```

### 3. Regenerate the initial migration

SQLite-generated SQL does not apply to PostgreSQL, so the migration history must be
regenerated (demo-scale data → accepted cost, design §9):

```bash
mv prisma/migrations /tmp/prisma-migrations-sqlite # archive, don't lose it
npx prisma migrate dev --name init                   # also regenerates the client
```

### 4. Reset and re-seed

```bash
npm run db:reset && npm run db:seed
```

`db:seed` stamps `SystemSetting["seed:origin"]` from the datasource provider **at seed
time**, so the marker now reads `postgresql`.

### 5. Prove it

```bash
npm run db:verify
# db:verify OK: seed:origin "postgresql" matches the schema provider and DATA_PROVIDER "postgresql".
```

Exit code `0`. Any drift exits `1` and prints the mismatch on stderr.

## What `db:verify` checks

1. **No database enums** — `prisma/schema.prisma` must not declare an `enum` block
   (matched as a real declaration, not as prose in a comment). A Prisma `enum` would make
   this switch a schema rewrite; status columns stay strings (spec req 16, scenario 2).
2. **Schema provider == `DATA_PROVIDER`** — the two literals must move together.
3. **`seed:origin` == schema provider** — the active provider is observable _in the data
   itself_ (spec req 16, scenario 1). Missing marker → fail with a `run db:seed` hint.

## Rollback

Revert the diff (provider literal, `DATABASE_URL`, `DATA_PROVIDER`, adapter import),
restore the archived `prisma/migrations`, then:

```bash
npm run db:reset && npm run db:seed && npm run db:verify
```
