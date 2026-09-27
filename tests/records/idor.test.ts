import assert from 'node:assert';
import test, { describe } from 'node:test';
import { prisma } from '../../lib/db/prisma.js';
import { createRecord, getRecordByPublicId, deleteRecord } from '../../lib/records/queries.js';

describe('IDOR (Insecure Direct Object Reference) Protection Tests', () => {
  const userA = `user_idor_a_${Date.now()}`;
  const userB = `user_idor_b_${Date.now()}`;
  let recordAPublicId: string;

  test('Setup test records', async () => {
    // Owner rows must exist before createRecord (production flow, not auto-provisioned)
    await prisma.user.createMany({
      data: [{ id: userA }, { id: userB }],
      skipDuplicates: true,
    });

    const recordA = await createRecord(userA, {
      title: 'User A Confidential Record',
      description: 'Secret data',
    });
    recordAPublicId = recordA.publicId;

    assert.ok(recordAPublicId, 'Record A publicId should exist');
  });

  test('User B accessing User A record returns null (404)', async () => {
    // Attempt cross-user access
    const result = await getRecordByPublicId(userB, recordAPublicId);
    assert.strictEqual(
      result,
      null,
      'Cross-user record lookup must return null (404), never the record'
    );
  });

  test('User B attempting to delete User A record returns false (404) and fails', async () => {
    // Attempt cross-user delete
    const result = await deleteRecord(userB, recordAPublicId, userB);
    assert.strictEqual(
      result,
      false,
      'Cross-user record delete must return false (404)'
    );

    // Verify record still exists for User A
    const recordAStillExists = await getRecordByPublicId(userA, recordAPublicId);
    assert.ok(
      recordAStillExists,
      'Record A must NOT be deleted by User B attempt'
    );
  });

  test('Cleanup test records', async () => {
    if (recordAPublicId) {
      await prisma.record.deleteMany({ where: { publicId: recordAPublicId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });
});
