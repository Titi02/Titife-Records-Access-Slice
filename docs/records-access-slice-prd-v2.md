**PRD: Records and Access Slice**

*Revision 2 — updated after structured PRD review*

# 1\. Product Summary

This is a focused reference implementation built with Next.js, TypeScript, Prisma, and PostgreSQL. It lets a signed-in user create, view, and delete records that belong only to them. The record's domain is arbitrary; the actual subject of this build is correct, structural access control: every query scoped by owner, no raw database identifiers exposed anywhere, an audit trail for every deletion, and fast client-side navigation where every screen still has its own real, shareable URL. There is no editing, search, sharing, or dashboard. Just create, list, view, delete.

# 2\. Problem Statement

Access-control bugs are rarely caught by functional testing, because the feature still "works" when it leaks. A screen that fetches a record and checks ownership afterward in application code looks identical, in a demo, to one that scopes the query itself, right up until someone edits an identifier in the URL. This slice exists to build and prove the correct pattern once: scope the query, hide the identifier, log the deletion, and measure the query cost, so the pattern can be lifted into other projects with confidence instead of re-derived under deadline pressure.

# 3\. Goals and Non-Goals

## Goals

* Let a signed-in user create, list, view, and delete only their own records.

* Make cross-user data access structurally impossible, not merely checked for.

* Keep every screen addressable by its own URL, without a full page reload between them.

* Record every deletion for audit before the record disappears.

* Measure and document the real query cost of each main action, and demonstrate a reduction from the first working version to the optimized version (see Section 13, Phase 4).

*FIX APPLIED: Reworded the fifth goal from "with a proven reduction" (present-tense, as if already established) to a target-outcome statement. The original phrasing contradicted Sections 7.6 and 11, which mark the same query-count figures as unmeasured placeholders.*

## Non-Goals

* No landing page.

* No editing of an existing record.

* No search, filtering by content, tags, sharing, or collaboration.

* No dashboard widgets or analytics screens.

* No multi-owner or team-owned records.

* No soft delete, recovery, or "trash" state for deleted records.

# 4\. User Personas

**End User:** a signed-in person who creates, checks on, and removes records that belong to them, and to no one else. They expect that what they see is always and only theirs, that a link to one of their records works reliably when bookmarked or shared with their own future self, and that deleting something actually removes it rather than leaving it recoverable or lingering.

This slice has no external business stakeholder persona. Its intended reuse by other engineering teams as a reference pattern is addressed in the Business Model section, not here.

# 5\. Functional Requirements

## 5.1 List (the signed-in user's records)

* Route: /records.

Query: fetch records where ownerId equals the authenticated user's ID, ordered by createdAt descending with id descending as a tiebreaker for records created in the same instant, limited to a page of 20, using cursor-based pagination. The cursor is carried in the URL as a search parameter (for example /records?cursor=abc123).

* If the user has never created a record: show a genuine empty state (an explanatory message and a call to action to create the first record). No placeholder rows, no sample data, no skeleton content standing in for records that don't exist.

* If the user has records but the current page is empty (for example, a stale bookmark past the last page): treat it the same as the genuine empty state, not as an error.

Each row links to that record's detail view using its publicId, never its internal database ID.

* Navigating to the create screen or a detail view does not trigger a full page reload; the URL still changes to reflect the new view.

*FIX APPLIED: Added id as a secondary sort key and cursor tiebreaker. Plain createdAt ordering can tie when two records are created in the same instant, which can skip or duplicate rows across pages under cursor pagination. The matching index change is in Section 7.7 and the schema in Section 10\.*

## 5.2 Create

* Route: /records/new, implemented as a Next.js intercepting route rendered as a modal over the list.

* Fields: title (required, 1 to 200 characters), description (optional, up to 2000 characters).

Validation is defined once, as a shared schema (Zod), used by both the client form and the Route Handler before any database write. A request that fails validation returns **400**, with field-level error messages returned to the client.

On submit: the new record is created with ownerId set to the authenticated user's ID, taken from the server-side session, never from any value submitted by the client.

* On success: the modal closes, the URL returns to /records, and the new record appears in the list.

* If accessed directly at /records/new (not as an intercepted overlay, for example via a fresh page load or a shared link): render the same form as a full page, not a broken modal shell.

*FIX APPLIED: Added the validation mechanism and the 400 response. The character limits on title and description were stated but never tied to an enforcement mechanism or a response code. Matching changes are in Sections 7.5, 7.9, and 11\.*

## 5.3 Detail View

* Route: /records/\[publicId\].

Query: fetch the record where publicId equals the route parameter and ownerId equals the authenticated user's ID, in a single query.

* If no record matches (because it does not exist, or exists but belongs to a different user): respond with 404\. These two cases are deliberately indistinguishable to the client. See Section 7.5.

* Displays title, description, createdAt, and a delete action. No edit action exists anywhere on this screen.

## 5.4 Delete and Audit

* Route: /records/\[publicId\]/delete, implemented as a Next.js intercepting route rendered as a confirmation modal over the detail view.

On confirmation: in a single database transaction, delete the record (scoped by publicId and ownerId in the same query) and insert a deletion audit record capturing the deleting user's ID, the record's owner ID, the record's publicId, the record's title at the time of deletion, and a timestamp.

* If the record does not exist or does not belong to the requesting user by the time the delete executes: respond with 404, and write no audit record, since nothing was deleted.

* If the delete succeeds: redirect to /records. The deleted record's URL now returns 404 if visited again.

* The audit record is never displayed anywhere in this slice's UI. It exists for backend accountability only.

* If accessed directly at /records/\[publicId\]/delete (not as an intercepted overlay): render the same confirmation as a full page.

# 6\. AI Processing Pipeline

Not applicable. This slice has no AI component. No model calls, no inference, no generated content anywhere in the system.

# 7\. Technical Requirements

## 7.1 Query Scoping, Authentication versus Authorization, and Session Enforcement

Authentication answers "who is making this request," and is resolved once per request into a userId, from the session. This slice assumes an existing authentication layer, consistent with a separate auth module, that resolves an incoming request to a userId through a server-only helper, referred to here as getCurrentUserId(). This slice does not implement sign-in, sign-out, or session issuance; it only consumes the resolved session.

**Enforcement point:** the getCurrentUserId() check runs in shared Next.js middleware covering every route under /records, not inside individual Route Handlers or Server Actions. A request with no valid session is rejected with 401 at the middleware layer before any handler code executes. Individual handlers can assume a valid userId is present by the time they run.

Authorization answers "is this specific user allowed to touch this specific record," and in this slice that question is never asked as a separate step. It is built into the shape of the query itself.

Every read, update, or delete of a record uses a WHERE clause that includes both ownerId and the record's publicId in the same query, for example:

prisma.record.findFirst({  
  where: { publicId, ownerId: currentUserId },  
})

This is why a leak is structurally impossible rather than merely checked for: there is no code path where a record belonging to another user is ever fetched into memory in the first place. A version of this code that instead fetched by publicId alone and then compared record.ownerId \=== currentUserId afterward would have a real record from another user sitting in a variable for the length of that check. Every bug, typo, or missed if in that pattern is a live data leak. Scoping the query removes that entire class of bug, because the database itself never returns the other user's row.

*FIX APPLIED: Added an explicit statement of where the 401 session check is enforced (shared middleware, one place), rather than leaving it to be repeated per handler. A check that depends on every future contributor remembering to re-implement it is not a structural guarantee, it's a convention that can silently drift.*

## 7.2 Identifier Handling and Insecure Direct Object References

Every Record has two identifiers: an internal Prisma primary key (id), never returned in any API response and never rendered anywhere in the UI, and a separate publicId (a cuid, unique, indexed), used in every URL, every API request, and every reference in the interface.

An insecure direct object reference happens when a user can change an identifier in a URL and reach another user's data by guessing or incrementing it. In this schema, that attack fails for two independent reasons. First, publicId is a cuid, not a sequential integer, so there is nothing to increment or guess toward. Second, and more importantly, even a correctly guessed publicId belonging to another user still fails, because every query scopes by ownerId as well (Section 7.1). A user editing /records/abc123 to /records/xyz789 either reaches their own record, or gets a 404, and there is no third outcome.

## 7.3 Audit Logging

Every deletion writes a row to DeletionAuditLog in the same database transaction as the delete itself, so a delete cannot commit without a corresponding audit entry, and an audit entry never exists without a real, executed delete through this application's own delete path. The audit table stores a denormalized snapshot: deletedByUserId, ownerId, recordPublicId, recordTitle, and deletedAt. It has no foreign key back to the Record table, because the record it describes no longer exists after the transaction commits. Deletions specifically are the one destructive, irreversible action in this slice, which is why they are the one action that gets a permanent, independent record: if a record disappears, there must be an answer to who removed it and when, even though the record itself can no longer be inspected.

This guarantee depends on every delete going through this application's own transaction, never through a database-level cascade. See Section 10 for how the schema enforces that.

## 7.4 Page Architecture: Conditional Rendering with URL State

Every screen in this slice has its own real route: /records, /records/new, /records/\[publicId\], /records/\[publicId\]/delete. The create and delete-confirmation screens use Next.js intercepting routes, so navigating to them from the list or detail view renders them as a modal layered over the current screen, without a full page reload, while the browser's URL still updates to the modal's own route. If that same URL is loaded directly, such as from a bookmark or a shared link, Next.js renders the equivalent full page instead of a broken overlay. This is why both properties matter together: the modal behavior makes the common in-app flow feel instant, and the real, distinct URL underneath it means every state is still something that can be bookmarked, shared, or reloaded correctly, which a client-side-only modal with no URL change cannot offer.

**Folder structure:** app/records/@modal/(.)new/page.tsx and app/records/@modal/(.)\[publicId\]/delete/page.tsx for the intercepted modal renders, with app/records/new/page.tsx and app/records/\[publicId\]/delete/page.tsx as the full-page fallbacks reached by direct navigation. The @modal slot is declared in app/records/layout.tsx.

*FIX APPLIED: Added the specific folder convention behind "use intercepting routes." The mechanism was named but not specified, and the (.) matching-segment convention and the @modal parallel route slot are exactly the kind of detail that's easy to get wrong and hard to guess from a general description.*

## 7.5 Status Codes

| Status | Meaning in this app | Triggered by |
| :---- | :---- | :---- |
| 400 | The request body fails schema validation | Triggered on create, before any database query runs, for example an empty or oversized title. |
| 401 | No valid session at all | Enforced uniformly by shared middleware covering every route in this slice, before any handler or record lookup runs. |
| 403 | Authenticated, but disallowed for a reason unrelated to a specific record's ownership | Not currently triggered anywhere in this slice's endpoints, since there are no roles, permission tiers, or account-level restrictions in scope. Reserved for that category of failure if this slice is extended later. |
| 404 | The requested record does not exist, or exists but is owned by a different user | Returned identically in both cases. The scoped query (Section 7.1) cannot distinguish "never existed" from "exists, not yours," and it must not be made to distinguish them: doing so, for example by returning 403 for the ownership case, would leak the fact that the record exists to someone who has no right to know that. |

 

*FIX APPLIED: Added 400 to the status code table. The mandatory requirement calls for correct status codes throughout, but validation failures had no defined response anywhere in the original document.*

## 7.6 Query Count as a Cost

Each of the three main actions is measured using Prisma's query logging, with an explicit before-and-after count and the specific change that produced the reduction. See Section 11 for the documented numbers. The specific before-and-after figures in Section 11 are illustrative targets based on the query patterns described below, not figures from an already-built system. They must be replaced with real measured numbers during the roadmap's optimization phase, described in Section 13\.

* List: a naive version fetches the page of records, then separately fetches a total count for pagination controls in a second round trip. The optimized version uses a single query with take plus a cursor, and infers whether a next page exists by fetching one extra row past the page size instead of running a separate count query.

* View: a naive version fetches the record by publicId alone, then runs a second query to confirm ownerId matches. The optimized version scopes both conditions into the single findFirst query shown in Section 7.1.

* Delete: a naive version fetches the record, checks ownership in application code, then deletes, then separately inserts the audit row, as four sequential round trips with no atomicity. The optimized version runs the scoped delete and the audit insert together inside a single Prisma transaction, as two queries with a guaranteed all-or-nothing outcome.

## 7.7 Database Indexing

| Column(s) | Index | Reason |
| :---- | :---- | :---- |
| Record.publicId | Unique index (from @unique) | Every read, update, and delete looks up a record by publicId. This is the single most frequent lookup in the system. |
| Record.ownerId, Record.createdAt, Record.id | Composite index | The list query filters by ownerId and sorts by createdAt descending with id descending as a tiebreaker. A composite index covering all three lets Postgres satisfy the filter, the sort, and the tiebreaker from the same index scan. |
| DeletionAuditLog.ownerId | Index | Supports looking up every deletion that happened to a given user's records, for future audit review. |
| DeletionAuditLog.deletedByUserId | Index | Supports looking up every deletion a given user has performed, for future audit review. |

 

*FIX APPLIED: Extended the composite index to include id, matching the cursor tiebreaker fix in Section 5.1.*

## 7.8 Empty States

The list screen's empty state is a real, distinct UI state, not a zero-length array silently rendering nothing. It states plainly that the user has no records yet and offers the create action. No screen in this slice ever renders placeholder, mocked, or sample data standing in for real content, including during loading: a loading state is a loading indicator, not fake rows that get replaced.

## 7.9 Stack, Structure, and Abuse Prevention

* Next.js App Router, using intercepting routes for the create and delete-confirmation modals, per the folder structure in Section 7.4.

* TypeScript throughout, no any types in query logic or shared types.

* Zod for shared validation schemas, used identically by client forms and Route Handlers.

* Prisma as the ORM, PostgreSQL as the database.

* Route Handlers under app/api/records/... for any request the UI cannot serve directly through a Server Component or Server Action.

**Create is rate limited** to prevent unbounded record creation by a single account. Specific threshold: open question, see Section 14\.

*FIX APPLIED: Added Zod to the locked stack list (tied to the 5.2 fix) and added a rate-limiting requirement for create, which was entirely absent from the original document despite being a write endpoint reachable by any authenticated user with no cap.*

# 8\. Business Model

This is an internal reusable reference implementation, not a monetized product. There is no pricing, subscription tier, or revenue model. Its value is measured by whether the ownership-scoping pattern it demonstrates is correct enough to be lifted, as-is, into other projects that need the same guarantee, not by any revenue it generates directly.

**Success as defined here is a build-time and test-time property,** verified through the correctness metrics in Section 11\. Actual reuse by future projects is not tracked by this document and is out of scope for its success metrics.

*FIX APPLIED: Added this clarifying line. The original section implied success includes eventual reuse by other teams, but Section 11 never measured reuse or adoption, only internal correctness. This closes that gap without inventing an adoption metric the document has no way to actually track.*

# 9\. Risks

| Risk | Impact | Mitigation |
| :---- | :---- | :---- |
| A future contributor adds a new query that fetches a record without scoping by ownerId, reintroducing the exact bug this slice exists to prevent | Cross-user data leak | Code review checklist item and an automated test that attempts cross-user access on every record-returning endpoint (see Section 13, Phase 5\) |
| A database-level cascade or trigger silently bypasses the application-level audit transaction | Deletions occur with no audit trail, defeating the audit-on-delete requirement | onDelete: Restrict on the Record.owner relation (see Section 10); any future cascade-like behavior must go through the audited delete path in application code, never a raw database constraint |
| Unbounded record creation by a single user, with no rate limit | Database growth, degraded pagination performance, inflated and misleading query-cost numbers | Rate limit on the create endpoint, threshold to be confirmed (see Section 14\) |
| cuid collision on publicId | A record could theoretically be created with a colliding identifier | Extremely low probability given cuid's collision resistance; the database-level unique constraint on publicId converts any collision into a hard creation failure rather than a silent overwrite |
| The audit transaction fails after the delete but before the audit insert completes | A deletion happens with no audit trail | Both operations run inside a single Prisma transaction; if the audit insert fails, the entire transaction, including the delete, rolls back, so a delete without an audit record cannot occur |
| Deletion audit logs retain a copy of the record's title indefinitely, with no stated retention limit | Data the user believed was deleted still exists in a different table | See Open Questions: retention policy for audit logs is not yet decided |
| Intercepting routes behave differently across Next.js versions and are easy to misconfigure | Modal flow breaks, or falls back to a broken full-page render instead of the intended UI | Manual verification of both the intercepted and direct-navigation cases for /records/new and /records/\[publicId\]/delete in Phase 5, against the folder structure specified in Section 7.4 |

 

*FIX APPLIED: Added two new risk rows: the cascade-delete bypass (the most severe finding in the review) and unbounded record creation with no rate limit.*

# 10\. Prisma Data Model

generator client {  
  provider \= "prisma-client-js"  
}  
   
datasource db {  
  provider \= "postgresql"  
  url      \= env("DATABASE\_URL")  
}  
   
model User {  
  id      String   @id @default(cuid())  
  records Record\[\]  
}  
   
model Record {  
  id          String   @id @default(cuid())  
  publicId    String   @unique @default(cuid())  
  ownerId     String  
  owner       User     @relation(fields: \[ownerId\], references: \[id\], onDelete: Restrict)  
  title       String  
  description String?  
  createdAt   DateTime @default(now())  
  updatedAt   DateTime @updatedAt  
   
  @@index(\[ownerId, createdAt, id\])  
}  
   
model DeletionAuditLog {  
  id              String   @id @default(cuid())  
  deletedByUserId String  
  ownerId         String  
  recordPublicId  String  
  recordTitle     String  
  deletedAt       DateTime @default(now())  
   
  @@index(\[ownerId\])  
  @@index(\[deletedByUserId\])  
}

**onDelete: Restrict is deliberate:** this slice has no user-deletion feature. If a future module adds one, it must delete that user's records explicitly, through the same scoped delete-and-audit transaction described in Section 5.4 and 7.3, not through a database cascade that bypasses the audit log.

*FIX APPLIED: This is the most severe fix in this revision. The original schema used onDelete: Cascade on the Record.owner relation. A cascade delete happens entirely inside Postgres, triggered by the foreign key constraint, with no application code running at all. That means every record belonging to a deleted user would vanish with zero audit trail, directly contradicting the audit-on-delete requirement this document treats as one of its core guarantees. Since no feature in this slice ever deletes a User, Cascade was never serving an in-scope purpose. Changed to Restrict, and added the composite index's id tiebreaker from the Section 5.1 and 7.7 fixes.*

# 11\. Success Metrics

| Metric | Target |
| :---- | :---- |
| Cross-user record access attempts (via IDOR test suite) that succeed | 0 |
| Endpoints returning the correct status code (400, 401, 404, and 403 where applicable) under test | 100% |
| Screens rendering placeholder or fake data instead of a genuine empty or loading state | 0 |
| Filtered or sorted columns without a supporting index | 0 |
| All 8 mandatory engineering requirements present and verifiable in code | 8 of 8 |

 

*FIX APPLIED: Added 400 to the status-code metric row, matching the Section 5.2 and 7.5 fixes.*

## Query count, before and after

Illustrative targets, to be replaced with real measured numbers during Phase 4 of the roadmap.

| Action | Before (naive) | After (optimized) | Change that produced the reduction |
| :---- | :---- | :---- | :---- |
| List | 2 queries (page fetch \+ separate count) | 1 query (page fetch with a lookahead row, no count query) | Removed the separate total-count query |
| View | 2 queries (fetch by publicId, then verify ownership) | 1 query (ownership scoped into the same findFirst) | Merged the ownership check into the initial query |
| Delete | 4 queries (fetch, check, delete, audit insert) | 2 queries (scoped delete and audit insert, in one transaction) | Removed the separate fetch-and-check step; combined delete and audit into one atomic transaction |

 

# 12\. Assumptions

* This slice assumes an existing authentication layer providing a server-only getCurrentUserId() helper; it does not implement sign-in, sign-out, or session issuance itself.

* The getCurrentUserId() check and the resulting 401 response are enforced once, in shared middleware covering every route under /records, not repeated per handler.

* A second delete request for an already-deleted record returns 404 and writes no additional audit row, since the scoped delete simply matches nothing the second time.

* The User model shown in the Prisma schema is a minimal placeholder for the purpose of this slice's own migrations and is expected to be reconciled with a real User model if this slice is combined with a separate auth module.

* Validation is implemented with Zod, one schema per form, shared between client and server.

* onDelete: Restrict is used instead of Cascade on the Record.owner relation, since this slice has no user-deletion feature and a cascade would bypass the audit-on-delete guarantee.

* A specific rate limit threshold for record creation is not yet set; see Open Questions.

* The before-and-after query count figures in Section 11 are illustrative targets based on the described query patterns, not numbers from an already-built system.

*FIX APPLIED: Added four new assumptions reflecting the fixes above: validation approach, middleware-based session enforcement, the Restrict decision, and the open rate-limit threshold.*

# 13\. Phased Roadmap

## Phase 1: Data layer and route structure

* Prisma schema, migrations, database connection. onDelete: Restrict on the Record.owner relation.

* Indexes: unique constraint on publicId, and the composite index on ownerId, createdAt, id.

* Decide and document the intercepting-route folder structure (@modal slot and matching segments) before any UI work begins.

## Phase 2: API and query logic

* Scoped queries for list, view, and delete, all filtering by ownerId in the query itself.

* Create logic setting ownerId from the server-side session only.

* Delete-and-audit transaction.

* Zod validation schemas for create, shared between the client form and the Route Handler.

* Shared session-check middleware covering every route under /records.

## Phase 3: UI

* List screen with genuine empty state and cursor-based pagination controls.

* Create screen as an intercepting-route modal, with a working direct-navigation fallback.

* Detail view.

* Delete confirmation as an intercepting-route modal, with a working direct-navigation fallback.

## Phase 4: Query measurement and optimization

* Enable Prisma query logging for the three main actions.

* Record the actual "before" query counts against the first working version from Phase 2 and 3\.

* Apply the optimizations described in Section 7.6.

* Record the actual "after" query counts and replace the illustrative figures in Section 11 with real measured numbers.

## Phase 5: Hardening and testing

* Automated test suite that attempts cross-user access on every record-returning endpoint by substituting another user's publicId, asserting 404 in every case.

* Verify 401 is returned with no session, and that a missing versus not-owned record are indistinguishable at 404\.

* Verify the delete transaction: force an audit-insert failure in a test and confirm the record delete rolls back with it.

* Verify both the intercepted-modal and direct-navigation renderings of /records/new and /records/\[publicId\]/delete, against the folder structure from Section 7.4.

* Confirm query plans (EXPLAIN) use the indexes defined in Section 7.7 for the list and lookup queries.

* Rate limiting on the create endpoint, threshold confirmed per Section 14, implemented and tested before hardening sign-off.

*FIX APPLIED: Added the folder-structure decision to Phase 1, added Zod schemas and session middleware to Phase 2, and added rate limiting to Phase 5\. None of these were scheduled anywhere in the original roadmap despite being required by other sections.*

# 14\. Open Questions

* Should the User model in this slice be the same User model from a separate, existing auth module, or should this slice remain fully decoupled with its own placeholder User model reconciled later?

* Is a second delete request against an already-deleted record's publicId acceptable as a silent 404, or does it need an explicit "already deleted" distinction for the client?

* What is an acceptable query count target for each of the three main actions, beyond simply "lower than the first working version"?

* What retention policy applies to DeletionAuditLog rows, given they permanently retain a copy of the record's title after the record itself is gone?

* What rate limit threshold applies to record creation per user (attempts per minute or hour)?

* Should the create-rate-limit be enforced per user only, or also per IP, consistent with how the separate auth module's rate limiting is scoped?

*FIX APPLIED: Added two new open questions on rate limiting, surfaced during review.*