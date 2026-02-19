// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('local-node-rig/profiles/default/includes/eslint/flat/patch/modern-module-resolution');

const nodeProfile = require('local-node-rig/profiles/default/includes/eslint/flat/profile/node');
const friendlyLocalsMixin = require('local-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

module.exports = [
  ...nodeProfile,
  ...friendlyLocalsMixin,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      }
    }
  }
];
