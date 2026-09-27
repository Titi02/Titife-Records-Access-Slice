import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId } from '@/lib/auth/session';
import { createRecordSchema } from '@/lib/validation/record';
import { getRecords, createRecord } from '@/lib/records/queries';
import { checkRateLimit } from '@/lib/rate-limit/limiter';

/**
 * GET /api/records
 * Returns paginated records owned by the authenticated user.
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  const searchParams = request.nextUrl.searchParams;
  const cursor = searchParams.get('cursor') ?? undefined;

  const result = await getRecords(userId, cursor);

  return NextResponse.json({
    data: result.records,
    nextCursor: result.nextCursor,
  });
}

/**
 * POST /api/records
 * Validates input with Zod, checks rate limits, and creates a record owned by session userId.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();

  // Rate limit check — see PRD 7.9, AGENTS.md Section 3 rule 8
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Server-side Zod validation — see PRD 5.2, 7.5
  const validationResult = createRecordSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: validationResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const record = await createRecord(userId, validationResult.data);

  // Invalidate any cached /records render so the next fetch reflects the create — see PRD 5.2
  revalidatePath('/records', 'page');

  return NextResponse.json({ data: record }, { status: 201 });
}
