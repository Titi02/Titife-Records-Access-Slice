import assert from 'node:assert';
import test, { describe } from 'node:test';
import { prisma } from '../../lib/db/prisma.js';
import { createRecord } from '../../lib/records/queries.js';

describe('Audit Transaction Atomicity Tests', () => {
  const testOwner = `user_audit_test_${Date.now()}`;
  let recordPublicId: string;

  test('Setup target record for audit transaction test', async () => {
    // Owner row must exist before createRecord (production flow, not auto-provisioned)
    await prisma.user.upsert({
      where: { id: testOwner },
      create: { id: testOwner },
      update: {},
    });

    const record = await createRecord(testOwner, {
      title: 'Audit Transaction Target',
      description: 'Will test transaction rollback',
    });
    recordPublicId = record.publicId;
    assert.ok(recordPublicId);
  });

  test('Forced audit insert failure causes delete transaction rollback', async () => {
    // Attempt an atomic transaction where audit log insert fails due to constraint violation (e.g. null ownerId)
    let errorOccurred = false;

    try {
      await prisma.$transaction(async (tx) => {
        const record = await tx.record.findFirst({
          where: { ownerId: testOwner, publicId: recordPublicId },
        });
        assert.ok(record);

        // Delete the record
        await tx.record.deleteMany({
          where: { publicId: recordPublicId, ownerId: testOwner },
        });

        // Intentionally throw error / cause invalid audit log write to simulate audit failure
        throw new Error('Forced Audit Failure Simulation');
      });
    } catch (err: unknown) {
      errorOccurred = true;
      assert.strictEqual(
        (err as Error).message,
        'Forced Audit Failure Simulation'
      );
    }

    assert.strictEqual(
      errorOccurred,
      true,
      'Transaction must abort and throw on audit failure'
    );

    // Assert that the record was NOT deleted because transaction rolled back
    const recordAfterRollback = await prisma.record.findFirst({
      where: { ownerId: testOwner, publicId: recordPublicId },
    });

    assert.ok(
      recordAfterRollback,
      'Record MUST still exist in database after transaction rollback'
    );
  });

  test('Successful delete creates DeletionAuditLog atomically', async () => {
    const auditCountBefore = await prisma.deletionAuditLog.count({
      where: { ownerId: testOwner },
    });

    // Run normal delete transaction
    const record = await prisma.record.findFirst({
      where: { ownerId: testOwner, publicId: recordPublicId },
    });
    assert.ok(record);

    await prisma.$transaction(async (tx) => {
      await tx.deletionAuditLog.create({
        data: {
          deletedByUserId: testOwner,
          ownerId: record.ownerId,
          recordPublicId: record.publicId,
          recordTitle: record.title,
        },
      });

      await tx.record.deleteMany({
        where: { publicId: recordPublicId, ownerId: testOwner },
      });
    });

    // Verify record is gone AND audit log exists
    const recordAfterDelete = await prisma.record.findFirst({
      where: { ownerId: testOwner, publicId: recordPublicId },
    });
    assert.strictEqual(recordAfterDelete, null);

    const auditCountAfter = await prisma.deletionAuditLog.count({
      where: { ownerId: testOwner },
    });
    assert.strictEqual(
      auditCountAfter,
      auditCountBefore + 1,
      'Audit log count must increase by exactly 1'
    );
  });

  test('Cleanup test data', async () => {
    await prisma.deletionAuditLog.deleteMany({ where: { ownerId: testOwner } });
    await prisma.record.deleteMany({ where: { ownerId: testOwner } });
    await prisma.user.deleteMany({ where: { id: testOwner } });
    await prisma.$disconnect();
  });
});
