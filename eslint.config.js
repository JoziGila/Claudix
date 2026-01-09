import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

// Dummy plugin to satisfy eslint-disable comments in files copied from VSCode
const localPlugin = {
  rules: {
    'code-no-any-casts': {
      meta: { type: 'suggestion' },
      create() { return {}; }
    },
    'code-no-dangerous-type-assertions': {
      meta: { type: 'suggestion' },
      create() { return {}; }
    }
  }
};

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'local': localPlugin
    },
    rules: {
      // 强制所有控制语句使用大括号 (warn only - many copied VSCode files don't follow this)
      'curly': 'warn',
      // TypeScript 相关规则
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs', '**/*.vue']
  }
];
