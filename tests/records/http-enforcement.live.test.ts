import assert from 'node:assert';
import { before, after, describe, test } from 'node:test';
import { prisma } from '../../lib/db/prisma.js';
import {
  SESSION_COOKIE_NAME,
  generateSessionToken,
  hashSessionToken,
} from '../../lib/auth/session.js';
import { createRecord } from '../../lib/records/queries.js';

/**
 * HTTP-level enforcement suite. Exercises the REAL enforcement surface:
 * real HTTP requests through the running Next server, so middleware AND the
 * Route Handlers both execute in the actual request lifecycle (this is the
 * one layer tests/records/middleware-enforcement.test.ts cannot cover,
 * because handlers read x-current-user-id via next/headers request scope).
 *
 * The entire suite is SKIPPED unless E2E_BASE_URL points at a running server.
 * This process (the AI agent) does not run security requests against a live
 * server — that is a manual step. See tests/records/manual-http-enforcement.md.
 *
 * Setup mirrors the existing User A / User B pattern from the IDOR suite:
 * real rows in the shared test database, cleaned up in `after`.
 */

const baseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, '') ?? '';
const liveEnabled = baseUrl.length > 0;

// Deterministic non-existent cuid-shaped publicId, distinct from any real row.
const NONEXISTENT_PUBLIC_ID = 'c000000000000000000000000';

describe(
  'HTTP Enforcement — LIVE server (requires E2E_BASE_URL)',
  {
    skip: liveEnabled
      ? false
      : 'Skipped: set E2E_BASE_URL to a running Next server and re-run. See tests/records/manual-http-enforcement.md.',
  },
  () => {
    let userAId = '';
    let userBId = '';
    let tokenA = '';
    let tokenB = '';
    let recordAPublicId = '';

    before(async () => {
      if (!liveEnabled) return;

      userAId = `http_enforce_a_${Date.now()}`;
      userBId = `http_enforce_b_${Date.now()}`;

      await prisma.user.createMany({
        data: [
          { id: userAId, email: `${userAId}@test.local` },
          { id: userBId, email: `${userBId}@test.local` },
        ],
        skipDuplicates: true,
      });

      tokenA = generateSessionToken();
      tokenB = generateSessionToken();
      await prisma.session.createMany({
        data: [
          { userId: userAId, sessionTokenHash: hashSessionToken(tokenA), expiresAt: new Date(Date.now() + 3_600_000) },
          { userId: userBId, sessionTokenHash: hashSessionToken(tokenB), expiresAt: new Date(Date.now() + 3_600_000) },
        ],
      });

      recordAPublicId = (
        await createRecord(userAId, { title: 'User A HTTP Enforcement Record' })
      ).publicId;

      assert.ok(recordAPublicId);
    });

    after(async () => {
      if (!liveEnabled) return;
      await prisma.deletionAuditLog.deleteMany({
        where: { ownerId: { in: [userAId, userBId] } },
      });
      await prisma.record.deleteMany({ where: { ownerId: { in: [userAId, userBId] } } });
      await prisma.session.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
      await prisma.$disconnect();
    });

    const authFetch = async (
      pathname: string,
      token: string,
      init?: RequestInit
    ): Promise<Response> =>
      fetch(`${baseUrl}${pathname}`, {
        ...init,
        headers: {
          ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
          ...init?.headers,
        },
      });

    test('unauthenticated GET /api/records returns 401', async () => {
      const res = await authFetch('/api/records', '');
      assert.strictEqual(res.status, 401);
      assert.deepStrictEqual(await res.json(), { error: 'Unauthorized' });
    });

    test('invalid create (blank title) returns 400 via Route Handler validation', async () => {
      const res = await authFetch('/api/records', tokenA, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      });
      assert.strictEqual(res.status, 400);
      const body = (await res.json()) as { error: string; issues?: unknown };
      assert.strictEqual(body.error, 'Validation failed');
      assert.ok(body.issues);
    });

    test('malformed JSON create returns 400', async () => {
      const res = await authFetch('/api/records', tokenA, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      });
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(await res.json(), { error: 'Invalid JSON payload' });
    });

    test('requesting a missing record returns 404', async () => {
      const res = await authFetch(`/api/records/${NONEXISTENT_PUBLIC_ID}`, tokenA);
      assert.strictEqual(res.status, 404);
      assert.deepStrictEqual(await res.json(), { error: 'Record not found' });
    });

    test('User B requesting User A record returns 404, identical to missing', async () => {
      const crossUser = await authFetch(`/api/records/${recordAPublicId}`, tokenB);
      const missing = await authFetch(`/api/records/${NONEXISTENT_PUBLIC_ID}`, tokenA);

      assert.strictEqual(crossUser.status, 404);
      assert.strictEqual(crossUser.status, missing.status);
      // 404 bodies must be byte-identical — never reveal existence — see PRD 5.3, 7.5
      const crossBody = await crossUser.json();
      const missingBody = await missing.json();
      assert.deepStrictEqual(crossBody, missingBody);
      assert.deepStrictEqual(crossBody, { error: 'Record not found' });
    });

    test('User A reading own record returns 200', async () => {
      const res = await authFetch(`/api/records/${recordAPublicId}`, tokenA);
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as { data: { publicId: string } };
      assert.strictEqual(body.data.publicId, recordAPublicId);
    });

    test('User B deleting User A record returns 404 and does not delete it', async () => {
      const res = await authFetch(`/api/records/${recordAPublicId}/delete`, tokenB, {
        method: 'POST',
      });
      assert.strictEqual(res.status, 404);
      assert.deepStrictEqual(await res.json(), { error: 'Record not found' });

      const stillExists = await prisma.record.findFirst({
        where: { ownerId: userAId, publicId: recordAPublicId },
      });
      assert.ok(stillExists, 'User A record must survive User B delete attempt');
    });
  }
);