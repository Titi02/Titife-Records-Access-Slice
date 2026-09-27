# Query Count Evidence — Create / List / View (before vs after)

**Date measured:** 2026-09-23
**Slice version measured:** as-built Phase 1–5 implementation, PostgreSQL, Prisma 6.4
**Measurements taken by:** direct invocation of the application query functions
(`lib/records/queries.ts`) against the live database, run via `tsx`.

---

## 1. Measurement method (identical for before and after)

- The Prisma client singleton (`lib/db/prisma.ts`) was created with
  `NODE_ENV=development`, so the built-in `prisma:query` logger was active.
- A real `prisma.$on('query', ...)` listener was attached to the same client and
  incremented a counter per emitted query event.
- As a cross-check, the built-in logger's `prisma:query` lines were counted in parallel.
  **Both counts were identical in every run** (`$on` count == built-in logger count),
  so the numbers below are each event stream reporting the same statements.
- Counters were reset immediately before each action and read back after the action
  completed, so each count covers exactly one Create, one List, and one View.
- The owner `User` row was seeded before each Create so the measurement reflects the
  production flow (where the owner provably exists, having logged in). This is the
  same setup in both the before and after run.

### Baseline status of these numbers

These are **live measured numbers of the pre-change, as-built implementation** — they
are **not** a reconstruction of a "first working version". The first working version
(when the naive fetch-then-check / count-query patterns existed) was **never committed
and never measured** in this repository. The PRD's own §11 "Before" column is an
illustrative target, not a measured historical value. No reduction is claimed against
any fabricated baseline.

---

## 2. Baseline (before the change)

| Action | Query statements | Notes |
| :--- | :--- | :--- |
| **Create** | **6** | 5 statements from the removed `prisma.user.upsert` + 1 from `prisma.record.create` |
| **List** | **1** | single scoped `findMany` with lookahead row (`LIMIT 21`-style), no count query |
| **View** | **1** | single scoped `findFirst` (`ownerId` + `publicId` together in the `WHERE`) |

### Create — the 6 pre-change statements, classified

Ran by `createRecord` (`lib/records/queries.ts`), with the owner row already present:

1. `BEGIN` — Prisma opens a transaction around `user.upsert` (that call-site's atomicity).
2. `SELECT "User"."id" ... WHERE ("id" = $1 AND 1=1) OFFSET $2` — upsert existence check.
3. `SELECT "User"."id","email" ... WHERE ("id" = $1 AND ("id" = $2 AND 1=1))` — upsert
   connect/decision step (fires on the existing-user branch).
4. `SELECT "User"."id","email" ... WHERE "id" = $1` — re-fetch so Prisma can return the
   upsert result (result unused by the function).
5. `COMMIT` — close the upsert transaction.
6. `INSERT INTO "Record" ("id","publicId","ownerId","title","description","createdAt","updatedAt")
   VALUES (...) RETURNING ...` — **the actual create**, the only statement that does work.

Statements 1–5 are entirely Prisma's internal `upsert` overhead. They existed only to
guarantee an owner row for callers that bypass login (primarily the test suite, which
passed arbitrary synthetic `userId` strings directly to `createRecord`).

`Create` measured counts: **$on: 6, built-in logger: 6.**

---

## 3. Change applied

Removed the defensive `prisma.user.upsert` block from `createRecord`
(`lib/records/queries.ts`) and documented why `ownerId` can be trusted:

> The owner user is guaranteed to exist: `ownerId` always comes from a validated
> session and a session can only reference an existing `User`.

Justification (no PRD/AGENTS rule violated):

- The only production caller is `POST /api/records` → `getCurrentUserId()`, which the
  middleware sets **only after** `validateSessionToken` returned a valid session. A
  session is FK'd to `User` (`onDelete: Cascade`) and can only exist for a user who
  already logged in — so the upsert's create-branch can never fire in production.
- Scoping under PRD 7.1 is untouched: `create` still writes `ownerId` from the server
  caller argument, never from the client.
- The two tests that relied on auto-provisioning (`tests/records/idor.test.ts`,
  `tests/records/audit-transaction.test.ts`) now explicitly seed their `User` rows first,
  mirroring the production flow.

No change was made to List or View — both were already a single scoped query and were
**deliberately left alone** (no fabricated "naive" version was introduced to fake a
reduction).

---

## 4. After the change

| Action | Query statements | Notes |
| :--- | :--- | :--- |
| **Create** | **1** | single `INSERT ... RETURNING` on `Record` |
| **List** | **1** | unchanged — already optimal |
| **View** | **1** | unchanged — already optimal |

`Create` after counts: **$on: 1, built-in logger: 1.**

---

## 5. Result — measured reduction

| Action | Before (measured) | After (measured) | Reduction |
| :--- | :--- | :--- | :--- |
| Create | 6 | 1 | **−5 statements** (removed Prisma upsert overhead) |
| List | 1 | 1 | ±0 (already optimized) |
| View | 1 | 1 | ±0 (already optimized) |

The Create reduction is real and live-measured: the 5 removed statements are classified
in §2 and none are touched by this run's count of 1. This satisfies the PRD's
"measured, documented reduction" goal for the Create action. List and View carry no
reduction claim — they were already at 1.

---

## 6. Verification performed with the change in place

- Full test suite: **10/10 pass** (`tsx --test tests/records/*.test.ts`, suites: audit
  transaction, IDOR, status codes).
- Type-check: `tsc --noEmit` — **clean** (zero errors).
- Production flow review: create still 201 with `ownerId` from the session-only source;
  list and view scoping queries unchanged; delete + audit transaction untouched.

---

## 7. Honesty note (per AGENTS.md §7)

- The pre-change count is a **live baseline of the as-built code**, captured immediately
  before the change — not a retroactive reconstruction.
- The project has **no measured "first working version"** to contrast against. The PRD's
  §11 "Before" figures are illustrative design targets (the PRD says so itself, §7.6 and
  §11), and no claim in this document treats them as historical measurements.
- List/View were **not** modified to manufacture a before/after delta.