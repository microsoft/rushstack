// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: ['@rushstack/eslint-config/profile/node'],
  plugins: ['@rushstack/eslint-plugin-packlets'],
  parserOptions: { tsconfigRootDir: __dirname },
  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      files: ['*.ts', '*.tsx'],

      rules: {
        '@rushstack/packlets/import-path': 'warn'
      }
    }
  ]
};
