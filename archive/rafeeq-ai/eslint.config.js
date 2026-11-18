// Copyright (c) 2026 DRS AI. All rights reserved.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/*', 'android/*', 'ios/*', 'dist/*', '.expo/*', 'coverage/*'],
  },
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='InteractionManager'][callee.property.name='runAfterInteractions'][arguments.length=0]",
          message: 'InteractionManager.runAfterInteractions() must be given a callback (RN 0.82+ crashes without one).',
        },
      ],
    },
  },
]);
