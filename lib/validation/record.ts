import { z } from 'zod';

export const createRecordSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title must be 200 characters or less' }),
  description: z
    .string()
    .trim()
    .max(2000, { message: 'Description must be 2000 characters or less' })
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
