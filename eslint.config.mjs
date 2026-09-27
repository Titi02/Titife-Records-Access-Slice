import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'prisma/migrations/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // next-env.d.ts and generated route types use triple-slash references by design
  {
    files: ['next-env.d.ts', '.next/types/**/*.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
];

export default eslintConfig;