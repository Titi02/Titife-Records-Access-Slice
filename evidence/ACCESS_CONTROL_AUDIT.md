# ACCESS_CONTROL_AUDIT — Cross-user access control evidence

- Date: 2026-09-23
- Environment: Next.js 15.5.26 (App Router), dev server at `http://localhost:3000`, PostgreSQL via Prisma
- Method: real HTTP requests with `curl.exe` (HTTP/1.1), real session cookies minted against the app database
- Users (created earlier for this slice's testing, reused from the existing seed/emails):
  - **User A**: `user_a@example.com` — id `cmud8ztlw0000usmkx0u1oy0x`
  - **User B**: `fames3217@gmail.com` — id `cmud8zj4v0003usacf4j6snlh`
- Target record: **User A's** record `cmudfwqa70003us80d8c919k3` (`AUDIT_TARGET_RECORD`), created via a real `POST /api/records` as User A (HTTP 201).
- Scope: every record-returning and record-mutating surface (JSON API + pages) probed cross-user. Requests were sent unmodified to the real server (no test doubles, no mocking).

## Results

| # | Method | Path | What was attempted | Actual response | PASS/FAIL |
|---|--------|------|--------------------|-----------------|-----------|
| 1 | GET | `/api/records/cmudfwqa70003us80d8c919k3` | B reads A's record detail (JSON) | **404** `{"error":"Record not found"}` | PASS |
| 2 | GET | `/api/records/cmudfwqa70003us80d8c919k3` | A reads own record detail (positive control) | 200, returns the record | PASS |
| 3 | GET | `/api/records` | B lists records | 200, contains only B's own records, A's target absent | PASS |
| 4 | GET | `/records/cmudfwqa70003us80d8c919k3` | B opens A's record detail page | **404** | PASS |
| 5 | GET | `/records/cmudfwqa70003us80d8c919k3` | A opens own record page (positive control) | 200 | PASS |
| 6 | GET | `/records` | B opens the list page | 200, page HTML contains none of A's record data | PASS |
| 7 | POST | `/api/records/cmudfwqa70003us80d8c919k3/delete` | B attempts to delete A's record (JSON) | **404** `{"error":"Record not found"}`; record still exists; 0 audit rows | PASS |
| 8 | GET | `/records/cmudfwqa70003us80d8c919k3/delete` | B opens A's delete-confirmation page | **404** | PASS |
| 9 | GET | `/api/records/cmudfwqa70003us80d8c919k4` | B edits last char of the identifier | 404, body byte-identical to row 12 | PASS |
| 10 | GET | `/api/records/cmudfwqa70003us80d8c91` | B truncates the identifier | 404, same body | PASS |
| 11 | GET | `/api/records/CMUDFWQA70003US80D8C919K3` | B changes identifier casing | 404, same body | PASS |
| 12 | GET | `/api/records/aaaaaaaaaaaaaaaaaaaaaaa1` | B requests a non-existent identifier (`n/a` cuid) | 404 `{"error":"Record not found"}` — indistinguishable from rows 1, 9-11 | PASS |
| 13 | GET | `/records/cmudfwqa70003us80d8c919k4` | B edits identifier on the page route | 404 | PASS |
| 14 | GET x2 | `/api/records/cmudfwqa70003us80d8c919k3` | B replays the cross-user read twice | 404 both times, identical body | PASS |
| 15 | POST x2 | `/api/records/cmudfwqa70003us80d8c919k3/delete` | B replays the cross-user delete twice | 404 both times; record intact afterwards; `DeletionAuditLog` rows for that `recordPublicId` = **0** | PASS |
| 16 | POST | `/api/records` | B creates a record sending `ownerId` = User A's internal id in the body | 201 (created); DB shows the new record's `ownerId` = **User B** (id `cmud8zj4v0003usacf4j6snlh`), A's account unchanged (still 1 record) | PASS |

## Confirmed invariants (DB-verified after all requests)

- `SPOOF_ownerId == User B` (server-side session, user-submitted `ownerId` ignored).
- A's target record (`cmudfwqa70003us80d8c919k3`) still exists after every B attempt.
- `DeletionAuditLog` rows referencing the target `recordPublicId` = 0 (no phantom audit entries).
- Failed (404) and successful (201) shapes contain `publicId` only — the internal Prisma `id` never leaks.

## Notes

- No application code was modified to produce this evidence.
- The transient 500 responses seen during earlier housekeeping were a local dev-server `.next` cache artifact (two servers sharing one cache), not an access-control behavior; after restarting a single clean server, every row above returned the correct status code.