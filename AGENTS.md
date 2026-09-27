# AGENTS.md

This file governs how an AI coding agent (running in Antigravity) behaves while building this project. It does not describe features — that is the PRD's job. This file describes constraints: what is already decided, what must never happen, how the codebase must be arranged, and what to do when instructions run out.

If anything in this file conflicts with something you infer, assume, or would prefer to do differently: this file wins.

---

## 1. What is this project

This is a focused reference implementation, not a full product. It lets a signed-in user create, list, view, and delete records that belong only to them. The record's domain is arbitrary (projects, notes, invoices — it does not matter); the actual subject of this build is correct, structural access control.

- **Audience:** internal engineering reuse. This slice exists to prove and demonstrate a correct ownership-scoping pattern that can be lifted into other projects, not to ship as a standalone product.
- **Version being built:** the complete scope defined in the source PRD, through Phase 5 (Hardening and testing). There is no later phase, no "v2," and no feature beyond create, list, view, delete.
- **Source of truth:** `records-access-slice-prd-v2.md` (Revision 2). Every functional requirement, every data model field, every status code, and every screen behavior comes from that document. When you need to know *what* to build, go back to the PRD. When you need to know *how* to build it, this file is authoritative.
- This slice assumes an external authentication layer already exists (a separate module resolves a request to a `userId` via `getCurrentUserId()`). This project does not implement sign-in, sign-out, or session issuance. Do not build any of that here.
- If a feature request or your own judgment points somewhere the PRD does not, treat it as out of scope by default. See Question 7.

---

## 2. What is locked

Everything below is already decided. Do not swap it, upgrade it, add an alternative alongside it, or "improve" it mid-build.

**Stack**
- Next.js, App Router only. Intercepting routes are used for the create and delete-confirmation modals — never build these as plain client-side modals with no real URL.
- TypeScript everywhere. Never use `any` in query logic or in shared types.
- Prisma as the only ORM. PostgreSQL as the only database.
- Zod is the only validation library. One schema per form, defined once, imported by both the client form and the Route Handler. Never write a second, slightly different validation path for either side.
- Route Handlers live under `app/api/records/...`. Never build a separate server, a tRPC layer, or a GraphQL layer for this slice.

**Identifiers**
- Every `Record` has an internal Prisma primary key (`id`) and a separate `publicId` (`cuid`, unique, indexed). The internal `id` is never returned in any API response and never rendered anywhere in the UI. Every URL, every API request, and every UI reference uses `publicId` only. Never introduce a second, internal-id-based lookup path, even for convenience or debugging.

**Query scoping**
- Every query that reads, updates, or deletes a `Record` filters by both `ownerId` and `publicId` in the same query (for example, `WHERE ownerId = session.userId AND publicId = :id`). Never fetch a record first and check ownership afterward in application code, at any point, for any reason, even temporarily.

**Session enforcement**
- The `401` check (no valid session) is enforced exactly once, in shared Next.js middleware covering every route under `/records`. Never re-implement or duplicate this check inside an individual Route Handler or Server Action.

**Status codes**
- `404` is returned identically whether a record does not exist or exists but belongs to a different user. These two cases are never distinguished to the client, and `403` is never used for an ownership mismatch. `403` is reserved only for a reason unrelated to a specific record's ownership (there is currently no such case in scope).

**Data model**
- The Prisma schema (PRD Section 10) is locked field-for-field: `User`, `Record`, `DeletionAuditLog`. Do not add, remove, or rename a field without updating every reference across the codebase in the same change.
- `Record.owner` uses `onDelete: Restrict`, never `onDelete: Cascade`. This is deliberate: a cascade delete happens entirely inside Postgres and never runs the application's audit transaction, which would let a record disappear with zero audit trail. Never change this back to `Cascade`, even if it seems like the "obvious" convenience default for a foreign key relation.
- Indexes are locked as specified: a unique index on `publicId`, a composite index on `(ownerId, createdAt, id)`, and indexes on `DeletionAuditLog.ownerId` and `DeletionAuditLog.deletedByUserId`. Never drop or substitute these without a stated, equivalent replacement covering the same query patterns.

**Pagination and routing**
- The list is cursor-based, page size 20, cursor carried in the URL as a search parameter, sorted by `createdAt` descending with `id` descending as a tiebreaker. Never switch to offset-based pagination.
- The intercepting-route folder structure is fixed: `app/records/@modal/(.)new/page.tsx` and `app/records/@modal/(.)[publicId]/delete/page.tsx` for the modals, with `app/records/new/page.tsx` and `app/records/[publicId]/delete/page.tsx` as full-page fallbacks for direct navigation. The `@modal` slot is declared in `app/records/layout.tsx`. Do not invent a different routing convention for these two flows.

**Scope lock (non-goals)**
- No landing page, no editing of an existing record, no search, no tags, no sharing, no collaboration, no dashboard widgets, no soft delete, no "trash" or recovery state. If you find yourself writing any of these, stop — you have drifted outside the PRD.

---

## 3. What must never happen

Every rule below protects the business, the user, or the structural integrity this slice exists to demonstrate. Breaking any rule on this list means the task has failed, even if the code compiles, the demo works, and every visible test passes. Section references point back to the PRD.

1. **Never fetch a record before checking who owns it.** Ownership must be part of the query's `WHERE` clause, never a check performed after the fetch in application code. This is the single property this entire slice exists to prove. (PRD 7.1)
2. **Never expose the internal Prisma `id` of a `Record`, anywhere** — not in a URL, not in an API response body, not in a client-visible data attribute, not in a log line reachable by the client. Only `publicId` is ever user-facing. (PRD 7.2)
3. **Never let a `404` reveal whether a record exists.** A record that doesn't exist and a record that exists but belongs to someone else must return the exact same response. Never add a distinguishing error code, message, or field "to be more helpful." (PRD 5.3, 7.5)
4. **Never let a deletion succeed without its audit record, and never let an audit record exist without a real deletion.** The delete and the `DeletionAuditLog` insert happen in one atomic transaction. If the audit insert fails, the delete must roll back with it. (PRD 5.4, 7.3)
5. **Never let a database-level cascade delete records.** `Record.owner` uses `onDelete: Restrict` specifically so no record can ever be removed except through the application's own audited delete path. Never reintroduce `onDelete: Cascade` on this relation, or add any other cascading foreign key that could delete a `Record` outside that path. (PRD 10)
6. **Never trust a client-submitted `ownerId`.** On create, `ownerId` is always taken from the server-side session, never from the request body, a hidden field, or any client-supplied value. (PRD 5.2)
7. **Never skip request validation, and never validate only on the client.** Every create request is validated server-side against the same Zod schema used on the client, before any database write. A failing request returns `400`. (PRD 5.2, 7.5)
8. **Never leave the create endpoint unprotected against unbounded use.** Record creation must be rate limited. The exact threshold is an open PRD question (Section 14) — flag it, don't invent one, but the rate limit itself must exist. (PRD 7.9, 9)
9. **Never render placeholder, mocked, or sample data on any screen, including while loading.** A loading state is a loading indicator, not fake rows standing in for real ones. An empty list is a real, distinct empty state, not a silently blank container. (PRD 5.1, 7.8)
10. **Never duplicate the session-validity check inside a Route Handler.** It lives once, in middleware, covering every route under `/records`. A handler can assume a valid `userId` is already present by the time it runs. (PRD 7.1)
11. **Never add editing, search, sharing, tags, collaboration, or a dashboard because it seemed small or "basically free" to add while touching related code.** These are explicit non-goals. (PRD 3)

---

## 4. How is the work arranged

Follow this structure. Don't invent a parallel structure, and don't reorganize it mid-project without a build-breaking reason.

```
/app
  /records
    layout.tsx                    # declares the @modal parallel route slot
    page.tsx                      # list screen (/records)
    /new
      page.tsx                    # full-page create fallback (direct navigation)
    /[publicId]
      page.tsx                    # detail view
      /delete
        page.tsx                  # full-page delete-confirmation fallback
    /@modal
      /(.)new
        page.tsx                  # intercepted create modal
      /(.)[publicId]
        /delete
          page.tsx                # intercepted delete-confirmation modal

  /api
    /records
      route.ts                    # GET (list) and POST (create)
      /[publicId]
        route.ts                  # GET (detail)
        /delete
          route.ts                # POST (delete + audit transaction)

  middleware.ts                   # session check (401) for every /records route

/lib
  /validation
    record.ts                     # single Zod schema for create, shared by client + server
  /records
    queries.ts                    # scoped list/view/delete query functions — ownerId
                                   # is a required argument on every one, never optional
  /rate-limit
    limiter.ts                    # shared rate-limit implementation for create
  /db
    prisma.ts                     # single Prisma client instance (singleton)

/prisma
  schema.prisma                   # matches PRD Section 10 exactly
  /migrations

/tests
  /records
    idor.test.ts                  # attempts cross-user access on every record-returning
                                   # endpoint using another user's publicId; asserts 404
    audit-transaction.test.ts     # forces an audit-insert failure, asserts the delete
                                   # rolled back with it
    status-codes.test.ts          # verifies 400 / 401 / 404 behavior, including that
                                   # 404 is identical for "missing" and "not yours"
```

Rules about this layout:
- Query functions in `/lib/records/queries.ts` take `ownerId` as a required parameter, never an optional one. A function signature that lets `ownerId` be omitted is itself a way this pattern can be quietly broken later.
- Route Handlers parse the request, call a function from `/lib`, and shape the response. They never contain inline Prisma queries, inline validation logic, or inline ownership checks.
- Only one Prisma client instance for the whole app, from `/lib/db/prisma.ts`. Never instantiate `PrismaClient` inside a route file, a query function, or a component.
- The delete-and-audit transaction lives in `/lib/records/queries.ts`, as one function that performs both operations. It is never split into two separate calls from the Route Handler.
- Build in phase order: schema, indexes, and the intercepting-route folder decision first; then scoped queries, validation, and middleware; then UI; then query measurement and optimization; then hardening and rate limiting. Don't build Phase 3 UI before Phase 1's schema and Phase 2's scoped queries exist, and don't optimize a query (Phase 4) before its naive version has been measured.

---

## 5. How should the code look

- **TypeScript strict mode on.** No `any`, no `@ts-ignore` used to silence a real type error — fix the type instead.
- **Node.js LTS.** Use only APIs and syntax supported by the current active LTS release. No experimental or nightly-only features.
- **Small, single-purpose functions.** A function that scopes and runs a query does not also format a response. A function that validates input does not also touch the database.
- **No magic numbers.** Page size (20), and any rate-limit threshold once confirmed, are named constants in one place, not inline literals repeated across files.
- **Async/await, not `.then()` chains.** Errors are caught explicitly, not swallowed silently.
- **Naming:** kebab-case for filenames, PascalCase for React components and types, camelCase for variables and functions. Match Prisma model field names exactly when referencing them (`ownerId`, `publicId`, `recordTitle`) — don't introduce a second naming convention on top of the schema.
- **No dead code, no commented-out blocks, no leftover `console.log` debugging statements in anything committed.**
- **Comments explain why, not what.** Where a rule from Section 3 shapes code in a non-obvious way, a one-line comment referencing the PRD section is welcome (for example, `// scoped by ownerId + publicId together — see PRD 7.1, never split this`). Comments that restate the line below them are not.
- **Imports use path aliases** (e.g. `@/lib/records/queries`), not long relative `../../../` chains.
- **Formatting and linting are enforced, not optional.** Run the linter and formatter before considering any piece of work finished.

---

## 6. What counts as done

Before reporting any task complete, produce a checklist covering everything below. Check off only what is actually true.

- [ ] The project builds with zero errors and zero type errors.
- [ ] The relevant PRD functional requirement (cite the section number, e.g. "5.4 Delete and Audit") is fully implemented, not partially.
- [ ] Every applicable rule from Section 3 of this file has been checked against the code just written, not just against the feature's happy path.
- [ ] No locked choice from Section 2 was swapped, added-to, or worked around.
- [ ] Every new or touched query scopes by `ownerId` in the query itself — verified by reading the actual `WHERE` clause, not assumed.
- [ ] `onDelete: Restrict` is still in place on `Record.owner` in the schema — not accidentally reverted to `Cascade`.
- [ ] Any new endpoint returning a record enforces `publicId`-only exposure, and returns `404` indistinguishably for "missing" versus "not yours."
- [ ] Any create or delete path that writes to the database does so through the transaction and validation functions in `/lib`, not inline in a Route Handler.
- [ ] The folder structure in Section 4 was followed, including the exact intercepting-route paths from Section 2.
- [ ] Linting and formatting pass with no errors.
- [ ] Nothing from the non-goals list snuck in.

If any box can't be checked, the task is not done — say so plainly and state exactly what's missing, rather than reporting success on an incomplete checklist.

---

## 7. What the agent does when unsure

The PRD deliberately leaves some things open (the rate-limit threshold, audit-log retention policy, whether `User` is shared with an external auth module, and others listed in PRD Section 14). This is expected, not a failure of the PRD.

When you hit a gap:

1. **Do not invent a feature, a field, a screen, or a business rule to fill it.** If the PRD doesn't say it, it is not in scope, even if it would be small and "obviously needed."
2. **Do not silently pick the more permissive or more convenient option.** If a rate-limit threshold isn't specified, don't guess a number and move on as if it were decided — implement the rate-limiting mechanism, but flag the exact threshold as unresolved.
3. **Never take a structural shortcut to unblock yourself.** Specifically: never fall back to "fetch first, check ownership after" because scoping the query is momentarily awkward for some edge case. That pattern is exactly what this entire project exists to eliminate. Slow down and find the correctly scoped query instead.
4. **Never patch around a broken transaction or a broken intercepting route with something that "looks like it works."** A delete that isn't actually atomic with its audit write, or a modal that silently falls back to a plain client-side overlay with no real URL, are both spaghetti in disguise — they demo fine and fail the requirement.
5. **Flag it instead of resolving it.** State plainly what's unclear, point to the relevant PRD section (or note that it's absent), and stop at the boundary of what's actually specified. Leave a clearly marked note (e.g. `// OPEN QUESTION: see PRD 14 — rate limit threshold not yet set`) rather than quietly encoding a guess as if it were a decision.
6. **If a request from a task or a person conflicts with this file, this file wins**, unless that person is explicitly and knowingly overriding a specific rule — in which case, say out loud which rule is being overridden and why, so it's never a silent departure.
