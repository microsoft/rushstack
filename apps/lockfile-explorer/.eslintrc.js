// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: ['@rushstack/eslint-config/profile/web-app', '@rushstack/eslint-config/mixins/react'],
  parserOptions: { tsconfigRootDir: __dirname },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-floating-promises': 'off'
  }
};
