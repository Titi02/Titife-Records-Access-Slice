import assert from 'node:assert';
import { before, after, describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { prisma } from '../../lib/db/prisma.js';
import {
  SESSION_COOKIE_NAME,
  generateSessionToken,
  hashSessionToken,
} from '../../lib/auth/session.js';
import { middleware } from '../../middleware.js';

/**
 * Automated enforcement tests that invoke the REAL middleware function
 * (middleware.ts) with real NextRequest objects on every path the config
 * matcher covers. These run without a server under `npm test`.
 *
 * They do NOT simulate the Route Handlers — see
 * tests/records/http-enforcement.live.test.ts for the full middleware →
 * Route Handler path, which requires a running Next server.
 */

const url = (pathname: string) => `http://localhost${pathname}`;

const requestTo = (pathname: string, headers?: Record<string, string>) =>
  new NextRequest(url(pathname), { headers });

describe('Middleware Enforcement (single 401 gate — PRD 7.1, AGENTS.md 3.10)', () => {
  const userIdA = `middleware_enforce_a_${Date.now()}`;
  const userIdB = `middleware_enforce_b_${Date.now()}`;
  let tokenA = '';
  let tokenB = '';

  before(async () => {
    await prisma.user.createMany({
      data: [
        { id: userIdA, email: `${userIdA}@test.local` },
        { id: userIdB, email: `${userIdB}@test.local` },
      ],
      skipDuplicates: true,
    });

    for (const userId of [userIdA, userIdB]) {
      const token = generateSessionToken();
      await prisma.session.create({
        data: {
          userId,
          sessionTokenHash: hashSessionToken(token),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      if (userId === userIdA) tokenA = token;
      else tokenB = token;
    }
  });

  after(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } });
    await prisma.record.deleteMany({ where: { ownerId: { in: [userIdA, userIdB] } } });
    await prisma.deletionAuditLog.deleteMany({
      where: { ownerId: { in: [userIdA, userIdB] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userIdA, userIdB] } } });
    await prisma.$disconnect();
  });

  for (const pathname of [
    '/api/records',
    '/api/records/some-public-id',
    '/api/records/some-public-id/delete',
  ]) {
    test(`unauthenticated ${pathname} returns 401 JSON`, async () => {
      const res = await middleware(requestTo(pathname));
      assert.strictEqual(res.status, 401);
      assert.deepStrictEqual(await res.json(), { error: 'Unauthorized' });
    });
  }

  for (const pathname of ['/records', '/records/new', '/records/some-public-id', '/records/some-public-id/delete']) {
    test(`unauthenticated ${pathname} page redirects to /login`, async () => {
      const res = await middleware(requestTo(pathname));
      assert.strictEqual(res.status, 307);
      assert.strictEqual(new URL(res.headers.get('location') ?? '').pathname, '/login');
    });
  }

  test('valid session on API path passes through with x-current-user-id for handlers', async () => {
    const res = await middleware(
      requestTo('/api/records', { cookie: `${SESSION_COOKIE_NAME}=${tokenA}` })
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.headers.get('x-middleware-request-x-current-user-id'),
      userIdA
    );
  });

  test('valid session on page path is not redirected', async () => {
    const res = await middleware(
      requestTo('/records', { cookie: `${SESSION_COOKIE_NAME}=${tokenB}` })
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('location'), null);
  });

  test('expired/unknown session token returns 401 (DB verification, never cookie trust alone)', async () => {
    const res = await middleware(
      requestTo('/api/records', {
        cookie: `${SESSION_COOKIE_NAME}=${generateSessionToken()}`, // hash not in DB
      })
    );
    assert.strictEqual(res.status, 401);
  });

  test('x-unauthenticated test seam forces 401 even with a valid cookie', async () => {
    const res = await middleware(
      requestTo('/api/records', {
        cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
        'x-unauthenticated': 'true',
      })
    );
    assert.strictEqual(res.status, 401);
  });

  test('paths outside /records and /api/records are not guarded', async () => {
    const res = await middleware(requestTo('/login'));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('location'), null);
  });
});