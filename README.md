# Records Access Slice

A focused reference implementation that lets a signed-in user create, list, view, and delete records belonging strictly to them — built to demonstrate correct, structural access control.

## Core Features
- **Login** — email sign-in via a Server Action, issuing a DB-backed session token in an `HttpOnly` cookie
- **Create** — intercepting-route modal with server-side Zod validation and rate limiting
- **List** — cursor-paginated (20/page) server-rendered list, newest first
- **View** — record detail page addressed by `publicId`
- **Delete** — confirmation modal executing an atomic delete + audit write

## Security Focus
- **Authentication** — single `401` gate in `middleware.ts`, covering every `/records` route
- **Query scoping** — `ownerId` is part of every `WHERE` clause, never a post-fetch check
- **IDOR protection** — `404` returned identically for "missing" and "not yours"; internal Prisma `id` never exposed
- **Deletion auditing** — `DeletionAuditLog` insert and `Record` delete share one transaction; `onDelete: Restrict` blocks unaudited cascades

## Tech Stack
Next.js 15 (App Router) · TypeScript · Prisma 6 · PostgreSQL · Zod · Node's test runner

## Quick Setup
```bash
npm install
copy .env.example .env      # set DATABASE_URL
npx prisma db push
npm run dev
```

**Local URL:** http://localhost:3000 (redirects to `/records`; sign in at `/login`)

**Tests:** `npm test` (IDOR, audit transaction, status codes) · `npm run test:http` (live HTTP enforcement)

## Full Documentation
See [DOCUMENTATION.md](./DOCUMENTATION.md) for the complete flow, data model, security rationale, and audit evidence.
