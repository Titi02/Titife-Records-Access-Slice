# Manual run guide — HTTP-level enforcement tests

`tests/records/http-enforcement.live.test.ts` exercises the **real HTTP
enforcement surface**: requests go through the running Next server, so
`middleware.ts` AND the Route Handlers execute in the actual request
lifecycle. Route Handlers read `x-current-user-id` via `next/headers`, which
is only available inside a live request — that is why these tests cannot run
inside the plain tsx harness and are **skipped unless `E2E_BASE_URL` is set**.

The AI-agent workflow does **not** perform live security requests. This file
defines what must be run manually and the exact evidence expected.

## What runs automatically vs. manually

- Automatic (no server, part of `npm test`):
  `tests/records/middleware-enforcement.test.ts` — invokes the real
  `middleware()` function on every matcher path (401 JSON for `/api/*`,
  redirect to `/login` for pages, `x-current-user-id` passthrough, expired
  token rejection, test seam).
- Manual (requires a running server):
  `tests/records/http-enforcement.live.test.ts` — full HTTP round-trips.

## Prerequisites

1. Database reachable and migrated (`prisma migrate deploy` or existing dev DB).
2. A running Next server with current code. Either:
   - `npm run dev` (default http://localhost:3000), or
   - `npm run build` then `npm start` (use a separate port to not collide with
     a running dev server, e.g. `npm start -- -p 3001`).

## Run

PowerShell:

```powershell
$env:E2E_BASE_URL = "http://localhost:3001"
npm test
```

cmd:

```cmd
set E2E_BASE_URL=http://localhost:3001 && npm test
```

or, to run only the HTTP suite:

```powershell
$env:E2E_BASE_URL = "http://localhost:3001"
npm run test:http
```

The suite creates its own Users A and B, sessions, and a record owned by
User A, and deletes all of it in cleanup. It is safe to run against the
shared database; every run uses fresh `Date.now()`-suffixed user IDs so the
per-user rate limiter is never tripped.

## Expected evidence (asserted by the suite)

| Check | Request | Expected |
|---|---|---|
| Unauthenticated → 401 | `GET /api/records` (no cookie) | 401, body `{"error":"Unauthorized"}` |
| Invalid create → 400 | `POST /api/records` as A, `{"title":"   "}` | 400, `error: "Validation failed"` + `issues` |
| Invalid create → 400 | `POST /api/records` as A, body `{not-json` | 400, `error: "Invalid JSON payload"` |
| Missing record → 404 | `GET /api/records/c000000000000000000000000` as A | 404, body `{"error":"Record not found"}` |
| User B reads A record → 404 | `GET /api/records/<A's publicId>` as B | 404, body byte-identical to the missing case |
| User B deletes A record → 404 | `POST /api/records/<A's publicId>/delete` as B | 404, body `{"error":"Record not found"}`, record still exists |
| Sanity | `GET /api/records/<A's publicId>` as A | 200 with `data.publicId` |

## Evidence to record

Capture the `npm test` / `npm run test:http` output (the node:test summary
line, e.g. `pass N, fail 0`) against a live server, and note which server was
used (command, port) and the commit/checkout of the code under test. That
output is the sign-off evidence for PRD Phase 5 HTTP-level enforcement.