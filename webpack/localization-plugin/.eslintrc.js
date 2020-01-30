// This is a workaround for https://github.com/eslint/eslint/issues/3458
require("@rushstack/eslint-config/patch-eslint6");

module.exports = {
  extends: [ "@rushstack/eslint-config" ],
  parserOptions: { tsconfigRootDir: __dirname },
};
