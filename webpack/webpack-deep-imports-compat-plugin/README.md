# @rushstack/webpack-deep-imports-compat-plugin

This package contains a plugin for webpack 5 that creates a bundle and commonJS files in a 'lib' folder,
mirroring modules in another 'lib' folder.

If you have a project that contains many loose files that may be imported via their path (instead of, or in
addition to the package's `main` entrypoint), but you don't want to pay the cost of reading many files from disk,
this plugin can be used to create a Webpack bundle that maintains compatibility with the paths to the
existing loose files.

This plugin is based on the built-in Webpack `DllPlugin`.

## Usage

In your `webpack.config.js` file, apply this plugin with

```JS
const { DeepImportsCompatPlugin } = require('@rushstack/webpack-deep-imports-compat-plugin');

const configuration = {
  entry: {
    'my-project': `${__dirname}/lib-esnext/index.js`
  },
  plugins: [
    new DeepImportsCompatPlugin({
      path: `${__dirname}/dist/my-project-manifest.json`, // From `DllPlugin`'s options
      inFolderName: 'lib-esnext', // The folder containing the original loose files and the entrypoint
      outFolderName: 'lib', // The folder where the bundle and commonJS files will be written
      pathsToIgnore: ['folder/not-included-in-bundle.js'],
      dTsFilesInputFolderName: 'lib-commonjs' // The folder containing loose .d.ts files
    })
  ]
};

module.exports = configuration
```
