import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { deleteRecord } from '@/lib/records/queries';

/**
 * POST /api/records/[publicId]/delete
 * Executes atomic record delete + DeletionAuditLog creation — see PRD 5.4, 7.3
 * Returns 404 identically if record does not exist OR belongs to another user — see PRD 5.3, 7.5
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const userId = await getCurrentUserId();
  const { publicId } = await params;

  const success = await deleteRecord(userId, publicId, userId);

  if (!success) {
    return NextResponse.json(
      { error: 'Record not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
