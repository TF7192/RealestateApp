import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Lint adoption strategy (2026-04-21): the frontend was never linted in
// CI before the SOTA pipeline landed. eslint-plugin-react-hooks v6 ships
// a batch of experimental rules that flag legitimate patterns the React
// docs bless. Disabled here with a documented upgrade path; tracked in
// BACKLOG.md as follow-ups. Real bugs (rules-of-hooks, exhaustive-deps,
// no-unused-vars) stay on.
export default defineConfig([
  globalIgnores([
    'dist',
    // Capacitor iOS/Android ship the built web bundle as a "source" file
    // — linting it scanned ~330 minified errors. These are build
    // artifacts, not source.
    'ios',
    'android',
    'node_modules',
    // Landing-page demo bundles served as static assets from /public.
    // They use `/* global React, ... */` and import from a CDN at
    // runtime; linting them as ESM source produces dozens of false
    // "defined but never used" errors. Tracked in BACKLOG.md.
    'public/landing',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ESLint's core no-unused-vars doesn't recognize JSX usages — for
      // patterns like `{stats.map(({ icon: Icon }) => <Icon />)}` the
      // local `Icon` is "unused" by the linter even though JSX renders
      // it. We don't pull in eslint-plugin-react just for this; instead
      // we ignore destructured/arg locals starting with a capital letter
      // (the React component convention) the same way `varsIgnorePattern`
      // does for top-level vars.
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          argsIgnorePattern: '^[A-Z_]',
          destructuredArrayIgnorePattern: '^[A-Z_]',
        },
      ],
      // Context providers legitimately co-export their component + hook
      // in one file; downgrade to warn so they don't block CI.
      'react-refresh/only-export-components': 'warn',
      // Experimental v6 react-hooks rules — defer. Track in BACKLOG.md.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      // react/prop-types is referenced by a stale eslint-disable comment
      // but the rule isn't registered (we don't use PropTypes). Explicit
      // off silences "Definition for rule not found".
      'react/prop-types': 'off',
    },
  },
  // Node config files read process.env / __dirname at build time.
  {
    files: ['vite.config.js', 'eslint.config.js', '*.config.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
