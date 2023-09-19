// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('eslint-config-local/patch/modern-module-resolution');

module.exports = {
  extends: ['eslint-config-local/profile/web-app', 'eslint-config-local/mixins/react'],
  parserOptions: { tsconfigRootDir: __dirname }
};
