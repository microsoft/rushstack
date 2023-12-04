'use strict';

const path = require('path');
const createWebpackConfigCommon = require('../../shared/webpack-base.config');

module.exports = function createWebpackConfig({ env, argv, projectRoot, configOverride }) {
  // Example: "@my-company/my-library"
  const packageName = require(path.join(projectRoot, 'package.json')).name;
  // Example: "my-library"
  const packageNameWithoutScope = packageName.split('/').pop();

  // Documentation: https://webpack.js.org/configuration/
  const libraryOverrides = {
    target: ['web', 'es5'],
    entry: {
      // Rush Stack convention is that the entry point for libraries is "src/index.ts"
      // whereas the entry point for apps is "src/start.ts"
      [packageNameWithoutScope]: path.resolve(projectRoot, 'lib', 'index.js')
    },
    output: {
      // For libraries, the filename is unhashed so that the package.json "main" field can refer to it
      filename: `[name].js`,
      library: {
        // Use the full package name as the module-id name for AMD
        amd: packageName
      },
      libraryTarget: 'umd',

      // https://webpack.js.org/configuration/output/#outputlibraryumdnameddefine
      // Give the amd module a globally unique id so that non AMD aware bundlers can concatenate the module
      umdNamedDefine: true,

      // From: https://webpack.js.org/configuration/output/#outputglobalobject
      // To make UMD build available on both browsers and Node.js, set output.globalObject option to 'this'
      globalObject: 'this'
    },
    devtool: 'source-map'
  };

  return createWebpackConfigCommon({
    env: env,
    argv: argv,
    projectRoot: projectRoot,
    // "If you're building a design system or component library and shipping to NPM you shouldn't
    // extract just yet, let your consumers do it in their app."
    // https://compiledcssinjs.com/docs/css-extraction-webpack
    extractCssInProduction: false,
    configOverride: createWebpackConfigCommon.merge(libraryOverrides, configOverride)
  });
};
