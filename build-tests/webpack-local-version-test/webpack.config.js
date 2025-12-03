'use strict';

module.exports = ({ webpack }) => {
  console.log(`Webpack version: ${webpack.version}`);
  const localWebpack = require.resolve('webpack');
  const bundledWebpack = require.resolve('webpack', {
    paths: [require.resolve('@rushstack/heft-webpack5-plugin')]
  });
  const localWebpackInstance = require(localWebpack);
  const bundledWebpackInstance = require(bundledWebpack);
  if (localWebpack === bundledWebpack || localWebpackInstance === bundledWebpackInstance) {
    throw new Error('Webpack versions match between bundled and local, cannot test rig loading.');
  }
  if (webpack.version !== localWebpackInstance.version) {
    throw new Error('Webpack is not the same version as the local installation');
  }

  // Verify that the Compiler instances match the local version.
  if (webpack.Compiler !== localWebpackInstance.Compiler) {
    throw new Error('Webpack instances do not match the local installation');
  }
  if (webpack.Compiler === bundledWebpackInstance.Compiler) {
    throw new Error('Received webpack instance is the same as the bundled version');
  }
  return {
    mode: 'development',
    entry: {
      'test-bundle': `${__dirname}/lib/index.js`
    }
  };
};
