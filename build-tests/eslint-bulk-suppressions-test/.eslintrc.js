// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');
require('@rushstack/eslint-config/patch/eslint-bulk-suppressions');

module.exports = {
  extends: ['plugin:@typescript-eslint/recommended'],
  parserOptions: { tsconfigRootDir: __dirname }
};
