const path = require('path');

module.exports = {
  stories: ['../lib/**/*.stories.js'],
  // naively referencing the name of the package causes storybook to fail to resolve it
  framework: path.resolve(require.resolve('@storybook/react-webpack5/preset'), '..')
};
