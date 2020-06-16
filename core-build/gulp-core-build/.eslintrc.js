// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch-eslint-resolver');

module.exports = {
  extends: ['@rushstack/eslint-config'],
  parserOptions: { tsconfigRootDir: __dirname },
  rules: {
    // This predates the new ESLint ruleset; not worth fixing
    '@typescript-eslint/no-use-before-define': 'off'
  }
};
