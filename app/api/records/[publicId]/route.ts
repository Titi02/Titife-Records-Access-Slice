import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { getRecordByPublicId } from '@/lib/records/queries';

/**
 * GET /api/records/[publicId]
 * Returns record detail if owned by user.
 * Returns 404 identically if missing OR owned by another user — see PRD 5.3, 7.5, AGENTS.md rule 3
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const userId = await getCurrentUserId();
  const { publicId } = await params;

  const record = await getRecordByPublicId(userId, publicId);

  if (!record) {
    return NextResponse.json(
      { error: 'Record not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: record });
}
