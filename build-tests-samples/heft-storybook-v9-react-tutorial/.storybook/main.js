const { Import } = require('@rushstack/node-core-library');

module.exports = {
  stories: ['../lib-esm/**/*.stories.js'],
  framework: Import.resolvePackage({
    packageName: '@storybook/react-webpack5',
    baseFolderPath: __dirname
  })
};
