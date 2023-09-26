// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('local-web-rig/profiles/library/includes/eslint/patch/modern-module-resolution');
// This is a workaround for https://github.com/microsoft/rushstack/issues/3021
require('local-web-rig/profiles/library/includes/eslint/patch/custom-config-package-names');

module.exports = {
  extends: [
    'local-web-rig/profiles/library/includes/eslint/profile/web-app',
    'local-web-rig/profiles/library/includes/eslint/mixins/friendly-locals'
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
