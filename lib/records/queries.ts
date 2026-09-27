import { prisma } from '@/lib/db/prisma';

export const PAGE_SIZE = 20;

export interface PublicRecord {
  publicId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedRecordsResult {
  records: PublicRecord[];
  nextCursor: string | null;
}

/**
 * List records owned by ownerId using cursor-based pagination.
 * Scoped by ownerId in the query — see PRD 7.1
 * Never exposes internal id — see PRD 7.2
 */
export async function getRecords(
  ownerId: string,
  cursorPublicId?: string
): Promise<PaginatedRecordsResult> {
  const take = PAGE_SIZE + 1; // Fetch 1 extra to check for next page

  const records = await prisma.record.findMany({
    where: {
      ownerId,
    },
    take,
    ...(cursorPublicId
      ? {
          cursor: {
            publicId: cursorPublicId,
          },
          skip: 1,
        }
      : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      publicId: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  let nextCursor: string | null = null;
  if (records.length > PAGE_SIZE) {
    const nextItem = records.pop();
    if (nextItem) {
      nextCursor = records[records.length - 1].publicId;
    }
  }

  return {
    records,
    nextCursor,
  };
}

/**
 * Get a single record scoped by ownerId + publicId together in the WHERE clause — see PRD 7.1
 * Returns null if record does not exist OR belongs to another user.
 * Never exposes internal id — see PRD 7.2
 */
export async function getRecordByPublicId(
  ownerId: string,
  publicId: string
): Promise<PublicRecord | null> {
  const record = await prisma.record.findFirst({
    where: {
      ownerId,
      publicId,
    },
    select: {
      publicId: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return record;
}

/**
 * Create a new record owned by ownerId.
 * Never trusts a client-supplied ownerId — see PRD 5.2, 7.5
 */
export async function createRecord(
  ownerId: string,
  data: { title: string; description?: string }
): Promise<PublicRecord> {
  // The owner user is guaranteed to exist: ownerId always comes from a validated
  // session (middleware) and a session can only reference an existing User.
  const record = await prisma.record.create({
    data: {
      ownerId,
      title: data.title,
      description: data.description ?? null,
    },
    select: {
      publicId: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return record;
}

/**
 * Delete a record and create an audit log entry in a single atomic transaction — see PRD 5.4, 7.3
 * Scoped by ownerId + publicId together in the query — see PRD 7.1
 * Returns true if record was deleted, false if record does not exist or belongs to another user.
 */
export async function deleteRecord(
  ownerId: string,
  publicId: string,
  deletedByUserId: string
): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    // 1. Scoped query by ownerId + publicId together — see PRD 7.1
    const record = await tx.record.findFirst({
      where: {
        ownerId,
        publicId,
      },
      select: {
        id: true,
        publicId: true,
        ownerId: true,
        title: true,
      },
    });

    if (!record) {
      return false;
    }

    // 2. Create deletion audit log within the transaction
    await tx.deletionAuditLog.create({
      data: {
        deletedByUserId,
        ownerId: record.ownerId,
        recordPublicId: record.publicId,
        recordTitle: record.title,
      },
    });

    // 3. Delete record scoped by publicId + ownerId together
    const deleteResult = await tx.record.deleteMany({
      where: {
        publicId: record.publicId,
        ownerId,
      },
    });

    if (deleteResult.count === 0) {
      throw new Error('Atomic delete failed');
    }

    return true;
  });
}
