'use strict';

// Flat ESLint config covering js/ (browser, plain <script> tags — no bundler,
// see CLAUDE.md) and scripts/ (Node/CommonJS data-refresh scripts).
//
// js/ files intentionally share one global scope across <script> tags (e.g.
// js/point-types.js defines `PointTypes`, consumed by js/norway-map.js with
// no import) — that's the site's actual module system, so `no-undef` would
// mostly flag legitimate cross-file globals rather than real bugs. It's kept
// off there and left on for scripts/, where `require()` makes an undefined
// reference an actual mistake.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'warn'
    }
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': 'warn'
    }
  },
  {
    ignores: ['assets/**', 'node_modules/**', 'scripts/node_modules/**']
  }
];
