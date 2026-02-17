# @rushstack/webpack-deep-imports-plugin

This package contains a plugin for webpack 5 that creates a bundle and commonJS files in a 'lib' folder,
mirroring modules in another 'lib' folder.

If you have a project that contains many loose files that may be imported via their path (instead of, or in
addition to the package's `main` entrypoint), but you don't want to pay the cost of reading many files from disk,
this plugin can be used to create a Webpack bundle that maintains compatibility with the paths to the
existing loose files.

This enables a couple common use cases:

- **Calling internal APIs:** SemVer compatibility guarantees may only apply to official public APIs,
  which are typically top-exports of the package's `main` module. However, in situations where
  certain functionality has not yet been exposed as a public API, consumers may find it expedient
  to use deep imports to access library internals, with the understanding that bypassing the
  API contract is done "at your own risk".

- **Unit test mocking:** Library APIs often neglect to expose interfaces needed for
  testability, such as intercepting network or disk operations. In order to write proper
  unit tests, it may be necessary to mock the library's internals. Deep imports provide
  a convenient way for tests to replace internal library modules with mock implementations.

This plugin is based on the built-in Webpack `DllPlugin`.

## Usage

In your `webpack.config.js` file, apply this plugin with

```JS
const { DeepImportsPlugin } = require('@rushstack/webpack-deep-imports-plugin');

const configuration = {
  entry: {
    'my-project': `${__dirname}/lib-esm/index.js`
  },
  plugins: [
    new DeepImportsPlugin({
      path: `${__dirname}/dist/my-project-manifest.json`, // From `DllPlugin`'s options
      inFolderName: 'lib-esm', // The folder containing the original loose files and the entrypoint
      outFolderName: 'lib', // The folder where the bundle and commonJS files will be written
      pathsToIgnore: ['folder/not-included-in-bundle.js'],
      dTsFilesInputFolderName: 'lib-commonjs' // The folder containing loose .d.ts files
    })
  ]
};

module.exports = configuration
```
