# Records and Access Slice — Documentation

## 1. What This Is

The **Records and Access Slice** is a focused reference implementation built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL. It allows signed-in users to create, list, view, and delete records that belong strictly to them. The application demonstrates correct, structural access control: every SQL query is scoped by the owner's ID, raw database primary keys are never exposed to clients, every deletion produces an atomic audit log entry, and all views remain directly addressable via real URLs without full page reloads.

To maintain absolute focus on structural ownership enforcement, several standard application features are deliberately excluded. There is no landing page, no editing of existing records, no content search or filtering, no tags, no record sharing or collaboration, no dashboard widgets, and no soft delete or "trash" recovery state.

---

## 2. How To Run It

### System Requirements
- **Node.js**: v24 LTS (or active LTS release).
- **Database**: PostgreSQL 16 (local instance or container).
- **Package Manager**: npm (v11+).

### Step-by-Step Setup
1. **Configure Environment Variables**:
   Copy `.env.example` to `.env` in the repository root:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL` in `.env` to match your local PostgreSQL connection parameters:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/records_access_slice?schema=public"
   ```

2. **Initialize Database Schema**:
   Run Prisma database push to apply tables and indexes:
   ```bash
   npx prisma db push
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

4. **Access Application**:
   Open your browser to `http://localhost:3000` (automatically routes to `/records`).

---

## 3. The Flow, Step By Step

### 1. Login
- **User Action**: Visits `/login`, enters an email (e.g. `userA@example.com`), and clicks **Sign In**.
- **Frontend Request**: Form submits via Server Action `login` in [`app/auth-actions.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/auth-actions.ts).
- **Server Execution**: Validates email with `loginSchema`, upserts `User` row in PostgreSQL, generates a random session token, stores SHA-256 `sessionTokenHash` in `Session` model via `createSession(userId)` in [`lib/auth/session.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/lib/auth/session.ts), sets `records_session` `HttpOnly` cookie, and redirects to `/records`.

### 2. List Records
- **User Action**: Navigates to `/records`.
- **Frontend Request**: Browser issues `GET /records`.
- **Server Execution**: [`middleware.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/middleware.ts) intercepts request, validates cookie token against `Session` model in DB (`validateSessionToken`), and injects header `x-current-user-id`. Server component [`app/records/page.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/records/page.tsx) reads `getCurrentUserId()` and calls `getRecords(userId, cursor)` in [`lib/records/queries.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/lib/records/queries.ts).
- **Query**: Executes single Prisma `findMany` scoped by `where: { ownerId }`, ordered by `createdAt desc, id desc`, fetching `take: 21` for cursor pagination. Rendered server-side.

### 3. Create Record
- **User Action**: Clicks **+ Create Record** button.
- **Frontend Request**: Next.js intercepting route intercepts navigation to `/records/new`, loading modal [`app/records/@modal/(.)new/page.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/records/@modal/(.)new/page.tsx) rendering [`components/RecordCreateForm.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/components/RecordCreateForm.tsx).
- **Form Submit**: Client POSTs JSON payload to `/api/records`.
- **Server Execution**: Route Handler [`app/api/records/route.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/api/records/route.ts) reads `getCurrentUserId()`, checks rate limit (`checkRateLimit`), validates body against Zod `createRecordSchema`, and calls `createRecord(userId, data)` executing `prisma.record.create`. Returns HTTP 201 JSON. Calls `revalidatePath('/records')` and modal closes.

### 4. View Detail
- **User Action**: Clicks a record title or **View** button.
- **Frontend Request**: Navigates to `/records/[publicId]`.
- **Server Execution**: [`app/records/[publicId]/page.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/records/%5BpublicId%5D/page.tsx) calls `getRecordByPublicId(userId, publicId)` in [`lib/records/queries.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/lib/records/queries.ts).
- **Query**: Executes `prisma.record.findFirst` with `where: { ownerId, publicId }`. If null, invokes Next.js `notFound()`, rendering identical 404 response.

### 5. Delete Record
- **User Action**: Clicks **Delete Record** button.
- **Frontend Request**: Next.js intercepting route loads deletion modal [`app/records/@modal/(.)[publicId]/delete/page.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/records/@modal/(.)[publicId]/delete/page.tsx). Confirming POSTs to `/api/records/[publicId]/delete`.
- **Server Execution**: Handler [`app/api/records/[publicId]/delete/route.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/api/records/%5BpublicId%5D/delete/route.ts) calls `deleteRecord(userId, publicId, userId)`.
- **Query**: Runs atomic `prisma.$transaction`: verifies record existence with `ownerId + publicId`, creates `DeletionAuditLog` row, and deletes `Record`. Returns HTTP 200 JSON, closing modal and refreshing list.

### Navigation & URL State
- **Intercepting Routes**: Navigating in-app renders modals while updating URL bar without page reloads.
- **Fallback Routes**: Refreshing the page or visiting `/records/new` or `/records/[publicId]/delete` directly renders full-page fallbacks ([`app/records/new/page.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/records/new/page.tsx) and [`app/records/[publicId]/delete/page.tsx`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/app/records/%5BpublicId%5D/delete/page.tsx)).

---

## 4. The Data Model

### Prisma Models & Schema ([`prisma/schema.prisma`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/prisma/schema.prisma))

```prisma
model User {
  id       String    @id @default(cuid())
  email    String?   @unique
  records  Record[]
  sessions Session[]
}

model Record {
  id          String   @id @default(cuid())
  publicId    String   @unique @default(cuid())
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  title       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([ownerId, createdAt, id])
}

model Session {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionTokenHash String   @unique
  expiresAt        DateTime
  createdAt        DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}

model DeletionAuditLog {
  id              String   @id @default(cuid())
  deletedByUserId String
  ownerId         String
  recordPublicId  String
  recordTitle     String
  deletedAt       DateTime @default(now())

  @@index([ownerId])
  @@index([deletedByUserId])
}
```

### Constraints & Indexes
- **`Record.publicId`**: Unique CUID string, indexed. Used for all URLs and external references.
- **`Record.owner` (`onDelete: Restrict`)**: Foreign key to `User.id`. Explicitly uses `Restrict` to prevent database-level cascade deletions from wiping records without audit logs.
- **Composite Index `@@index([ownerId, createdAt, id])`**: Optimized for cursor-based pagination sorting (`WHERE ownerId = :userId ORDER BY createdAt DESC, id DESC`).

---

## 5. The Concepts

- **Authentication vs. Authorization**: Authentication verifies *who the user is* (session token validation in `middleware.ts`). Authorization enforces *what data they can access* by embedding `ownerId` directly in every database query.
- **Query Scoping vs. Post-Fetch Checks**: Query scoping filters rows at the database layer (`WHERE ownerId = :userId AND publicId = :publicId`). Post-fetch checks query by ID first and check ownership in application code, which causes timing leaks and IDOR vulnerabilities.
- **IDOR Elimination**: Insecure Direct Object Reference is impossible because non-owned records are excluded by SQL `WHERE` criteria before database results are returned.
- **Public ID Isolation**: The internal primary key `Record.id` is never exposed in API JSON, URLs, or DOM elements. Only `publicId` is client-visible.
- **HTTP Status Codes (401 vs 403 vs 404)**:
  - `401 Unauthorized`: Unauthenticated request (missing/invalid session).
  - `403 Forbidden`: Unused for ownership mismatches.
  - `404 Not Found`: Returned identically for non-existent records AND records owned by another user to prevent existence enumeration.
- **Atomic Deletion Audit**: Deletions execute within `prisma.$transaction`. If writing `DeletionAuditLog` fails, the transaction rolls back, preserving the record.

---

## 6. What Went Wrong

1. **Prisma Engine DLL Lock (`EPERM`)**:
   - *Symptom*: `EPERM: operation not permitted, rename ... query_engine-windows.dll.node.tmp` during `npx prisma generate`.
   - *Investigation*: Process inspection revealed Node.js dev server held open file handles to DLL binaries.
   - *Cause*: `next dev` locked active native DLL modules on Windows.
   - *Fix*: Added a cross-platform `"clean"` script to `package.json` (`node -e "require('fs').rmSync('.next', { recursive: true, force: true })"`) and instructed stopping `next dev` prior to schema modifications.

2. **React Server Components Manifest Mismatch**:
   - *Symptom*: `Error: Could not find the module ... segment-explorer-node.js#SegmentViewNode in the React Client Manifest`.
   - *Investigation*: Inspected build cache after running `npm run build` alongside `next dev`.
   - *Cause*: Production build manifests desynchronized devtools overlay maps.
   - *Fix*: Configured `"dev": "npm run clean && next dev"` in `package.json` to purge `.next` cache on every dev server boot.

3. **Route Compilation Redirect Error**:
   - *Symptom*: Terminal output logged `GET /records 404` and `GET /login 404`.
   - *Investigation*: Checked middleware redirect flow for unauthenticated requests.
   - *Cause*: Requests redirected to `/login` before Next.js dev server compiled `app/login/page.tsx` into memory.
   - *Fix*: Verified `app/login/page.tsx` route handler compilation and route status codes.

---

## 7. What This Slice Does Not Handle

- **In-Memory Rate Limiting**: `checkRateLimit` in [`lib/rate-limit/limiter.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/lib/rate-limit/limiter.ts) uses a local JavaScript `Map`, which does not share state across distributed serverless instances.
- **Audit Log Archival**: `DeletionAuditLog` entries accumulate indefinitely without automated retention or pruning logic.
- **Out-of-Scope Features**: Record editing, full-text content search, multi-tenant sharing/collaboration, soft deletes, and user profile management.

---

## 8. If I Built This Again

If I built this reference slice again, I would introduce a Redis-backed token bucket rate limiter and distributed session store. This would enable stateless horizontal scaling across multi-region serverless deployments while preserving single-query performance and strict audit transactional integrity.

---

## Evidence

The following verified audit artifacts exist in the `evidence/` directory:

### 1. Access-Control Audit Table ([`evidence/ACCESS_CONTROL_AUDIT.md`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/evidence/ACCESS_CONTROL_AUDIT.md))

| # | Method | Path | What was attempted | Actual response | PASS/FAIL |
|---|--------|------|--------------------|-----------------|-----------|
| 1 | GET | `/api/records/cmudfwqa70003us80d8c919k3` | User B reads User A's record detail (JSON API) | **404** `{"error":"Record not found"}` | PASS |
| 2 | GET | `/api/records/cmudfwqa70003us80d8c919k3` | User A reads own record detail (positive control) | **200**, returns record JSON | PASS |
| 3 | GET | `/api/records` | User B lists records | **200**, returns only B's records, A's record absent | PASS |
| 4 | GET | `/records/cmudfwqa70003us80d8c919k3` | User B opens User A's record page in browser | **404** Not Found page | PASS |
| 5 | GET | `/records/cmudfwqa70003us80d8c919k3` | User A opens own record page (positive control) | **200** OK page | PASS |
| 6 | GET | `/records` | User B opens records list page | **200**, page HTML contains 0 of User A's records | PASS |

### 2. Query Count Table ([`evidence/QUERY_COUNT.md`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/evidence/QUERY_COUNT.md))

| Action | Pre-optimization Statements | Post-optimization Statements | Delta | Classification of Removed Statements |
| :--- | :--- | :--- | :--- | :--- |
| **Create** | **6** | **1** | **-5** | Removed redundant `prisma.user.upsert` transaction overhead |
| **List** | **1** | **1** | **0** | Single scoped `findMany` query with lookahead limit |
| **View** | **1** | **1** | **0** | Single scoped `findFirst` query (`ownerId + publicId`) |

### 3. Verification Screenshots
- **Deletion Audit Log Screenshot**: `evidence/evidencescreenshotsdeletion-audit-log.png.png` — **PASS** (Verifies atomic audit creation in DB).
- **Non-DB-Identifier URL Screenshot**: `evidence/non-db-identifier-url.png.png` — **PASS** (Verifies public CUID in browser address bar).

---

## Defense Questions

### 1. Show a real query and explain what happens if the `userId`/owner condition is removed.
```ts
const record = await prisma.record.findFirst({
  where: { ownerId, publicId },
  select: { publicId: true, title: true, description: true, createdAt: true, updatedAt: true },
});
```
*Explanation*: If `ownerId` is removed from `where`, the query becomes `where: { publicId }`. Any authenticated user who knows or guesses another user's `publicId` will receive their record data, introducing a critical IDOR vulnerability.

### 2. If I change or guess the identifier in the URL, walk through every layer that prevents access.
- **Layer 1 (Middleware)**: Intercepts request, checks `records_session` cookie against DB, and injects `x-current-user-id`.
- **Layer 2 (Query Layer)**: Query function executes `WHERE ownerId = session.userId AND publicId = guessedId`. PostgreSQL filters out non-owned rows.
- **Layer 3 (Handler Layer)**: Query returns `null`. Route Handler returns `404 {"error": "Record not found"}`, indistinguishable from a non-existent record ID.

### 3. Which single change caused the biggest query-count reduction, and why?
Removing the defensive `prisma.user.upsert` block from `createRecord` in [`lib/records/queries.ts`](file:///c:/Users/USER/Desktop/Titife%20Records%20Access/lib/records/queries.ts). The upsert issued 5 internal Prisma transaction/query statements per creation. Because `ownerId` originates from a validated session (where `User` provably exists), removing `upsert` reduced Create query count from **6 statements to 1 statement**.

### 4. Why is a case a 401, 403, or 404?
- **401**: Returned when a request to `/api/records` lacks a valid session token.
- **403**: Never used for non-owned records to prevent disclosing record existence.
- **404**: Returned identically when a record does not exist OR when it exists but belongs to a different user, preventing IDOR enumeration.
