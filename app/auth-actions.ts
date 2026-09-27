'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { loginSchema } from '@/lib/validation/login';
import { createSession, deleteSession } from '@/lib/auth/session';

export interface LoginState {
  error?: string;
}

/**
 * Email-only login: find or create the user, then issue a server-side session.
 * ownerId is never taken from the client on any record write — see PRD 5.2.
 */
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get('email');

  const parsed = loginSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: 'Enter a valid email address.' };
  }

  const user = await prisma.user.upsert({
    where: { email: parsed.data.email },
    create: { email: parsed.data.email },
    update: {},
  });

  await createSession(user.id);

  redirect('/records');
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect('/login');
}