import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', '.superpowers/**', 'coverage/**'] },
  js.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
];
