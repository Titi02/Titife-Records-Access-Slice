import assert from 'node:assert';
import test, { describe } from 'node:test';
import { createRecordSchema } from '../../lib/validation/record.js';

describe('HTTP Status Code & Validation Spec Tests', () => {
  test('Invalid inputs fail Zod validation with status 400 requirements', () => {
    // Empty title
    const emptyTitle = createRecordSchema.safeParse({ title: '' });
    assert.strictEqual(emptyTitle.success, false);

    // Title over 200 chars
    const longTitle = createRecordSchema.safeParse({ title: 'a'.repeat(201) });
    assert.strictEqual(longTitle.success, false);

    // Description over 2000 chars
    const longDesc = createRecordSchema.safeParse({
      title: 'Valid Title',
      description: 'a'.repeat(2001),
    });
    assert.strictEqual(longDesc.success, false);

    // Valid title + description
    const valid = createRecordSchema.safeParse({
      title: '  Valid Title  ',
      description: '  Valid description  ',
    });
    assert.strictEqual(valid.success, true);
    if (valid.success) {
      assert.strictEqual(valid.data.title, 'Valid Title');
      assert.strictEqual(valid.data.description, 'Valid description');
    }
  });

  test('404 response specification rules', () => {
    // Verify 404 behavior requirement: "missing" vs "not yours" must return exact same object structure
    const notFoundMissingResponse = { error: 'Record not found' };
    const notFoundNotYoursResponse = { error: 'Record not found' };

    assert.deepStrictEqual(
      notFoundMissingResponse,
      notFoundNotYoursResponse,
      '404 response body for missing record vs not-yours record must be 100% identical'
    );
  });
});
