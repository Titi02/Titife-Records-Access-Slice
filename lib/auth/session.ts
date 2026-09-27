import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';

export const SESSION_COOKIE_NAME = 'records_session';

const SESSION_DURATION_DAYS = 30;
const SESSION_DURATION_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a DB-backed session and set the HttpOnly cookie.
 * Only the token hash is stored; the raw token stays in the browser cookie.
 */
export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  await prisma.session.create({
    data: { userId, sessionTokenHash: tokenHash, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

/**
 * Validate a raw session token against the DB. Sliding window: every valid
 * request extends the expiry. Used by middleware, where next/headers cookies()
 * is unavailable — the token is read from the request's own cookie header.
 */
export async function validateSessionToken(
  token: string
): Promise<{ userId: string; sessionId: string } | null> {
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: tokenHash },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + SESSION_DURATION_SECONDS * 1000) },
  });

  return { userId: session.userId, sessionId: session.id };
}

export async function getCurrentSession(): Promise<{
  userId: string;
  sessionId: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashSessionToken(token);
    await prisma.session.deleteMany({
      where: { sessionTokenHash: tokenHash },
    });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Resolves the authenticated userId from the header injected by middleware.
 * Middleware enforces the single 401 gate and validates the session exactly
 * once per request — see PRD 7.1, AGENTS.md Section 3 rule 10.
 */
export async function getCurrentUserId(): Promise<string> {
  const headerList = await headers();
  const userId = headerList.get('x-current-user-id');
  if (!userId) {
    throw new Error(
      'Session not resolved — middleware must set x-current-user-id before a handler runs'
    );
  }
  return userId;
}