// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('local-node-rig/profiles/default/includes/eslint/patch/modern-module-resolution');
// This is a workaround for https://github.com/microsoft/rushstack/issues/3021
require('local-node-rig/profiles/default/includes/eslint/patch/custom-config-package-names');

module.exports = {
  extends: [
    'local-node-rig/profiles/default/includes/eslint/profile/node',
    'local-node-rig/profiles/default/includes/eslint/mixins/friendly-locals',
    'local-node-rig/profiles/default/includes/eslint/mixins/tsdoc'
  ],
  parserOptions: { tsconfigRootDir: __dirname }
};
