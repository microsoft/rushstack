// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: ['@rushstack/eslint-config'],
  parserOptions: { tsconfigRootDir: __dirname },

  rules: {
    // api-extractor-model uses namespaces to represent mixins
    '@typescript-eslint/no-namespace': 'off'
  }
};
