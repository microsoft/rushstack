// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-config/patch/modern-module-resolution');
require('@rushstack/eslint-config/patch/eslint-global-suppressions');

module.exports = {
  extends: ['plugin:@typescript-eslint/recommended'],
  parserOptions: { tsconfigRootDir: __dirname },

  overrides: [
    /**
     * Override the parser from @rushstack/eslint-config. Since the config is coming
     * from the workspace instead of the external NPM package, the versions of ESLint
     * and TypeScript that the config consumes will be resolved from the devDependencies
     * of the config instead of from the eslint-7-test package. Overriding the parser
     * ensures that the these dependencies come from the eslint-7-test package. See:
     * https://github.com/microsoft/rushstack/issues/3021
     */
    {
      files: ['**/*.ts', '*/*.tsx'],
      parser: '@typescript-eslint/parser'
      // parserOptions: {
      //   tsconfigRootDir: __dirname,
      //   project: './tsconfig.json'
      // }
    }
  ]
};
