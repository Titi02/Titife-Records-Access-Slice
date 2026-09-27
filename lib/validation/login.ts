import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Enter a valid email address' })
    .max(254, { message: 'Email must be 254 characters or less' })
    .toLowerCase(),
});

export type LoginInput = z.infer<typeof loginSchema>;