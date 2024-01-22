var path = require('path');

// https://storybook.js.org/docs/faq#how-do-i-fix-module-resolution-in-special-environments
const getAbsolutePath = (packageName) =>
  path.dirname(require.resolve(path.join(packageName, 'package.json')));

module.exports = {
  stories: ['../lib/**/*.stories.js'],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials'],
  framework: {
    name: getAbsolutePath('@storybook/react-webpack5')
  }
};
