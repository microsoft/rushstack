// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('local-node-rig/profiles/default/includes/eslint/patch/modern-module-resolution');
// This is a workaround for https://github.com/microsoft/rushstack/issues/3021
require('local-node-rig/profiles/default/includes/eslint/patch/custom-config-package-names');

module.exports = {
  extends: ['local-node-rig/profiles/default/includes/eslint/profile/node'],
  parserOptions: { tsconfigRootDir: __dirname },

  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};
