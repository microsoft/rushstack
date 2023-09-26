// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('eslint-config-local/patch/modern-module-resolution');
// This is a workaround for https://github.com/microsoft/rushstack/issues/3021
require('eslint-config-local/patch/custom-config-package-names');

module.exports = {
  extends: [
    'eslint-config-local/profile/node',
    'eslint-config-local/mixins/friendly-locals',
    'eslint-config-local/mixins/tsdoc'
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
