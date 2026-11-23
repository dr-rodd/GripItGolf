// test:hooks (D291) — the one lint rule the test suite runs: React's rules of
// hooks, over every component. A hook after an early return renders a
// different number of hooks from one render to the next, and React throws:
// the club footer did that, and every tap between a page with a footer and
// one without showed "Could not load this page" until the new page landed.
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['app/**/*.tsx', 'app/**/*.ts', 'lib/**/*.ts', 'lib/**/*.tsx'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
]
