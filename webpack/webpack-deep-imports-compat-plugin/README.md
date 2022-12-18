# @rushstack/webpack-deep-imports-compat-plugin

This package contains a plugin for webpack 5 that creates a bundle and commonJS files in a 'lib' folder,
mirroring modules in another 'lib' folder.

If you have a project that contains many loose files that may be imported via their path (instead of, or in
addition to the package's `main` entrypoint), but you don't want to pay the cost of reading many files from disk,
this plugin can be used to create a Webpack bundle that maintains compatibility with the paths to the
existing loose files.

## Example Project

Imagine you have a project with a `lib-esnext` folder with a structure that looks like this:

- `lib-esnext/`
  - `index.js`
  - `otherFileA.js`
  - `folder/`
    - `otherFileB.js`

and you want these paths to be exposed to consumers in a folder called `lib`.

This project would use a `webpack.config.js` file that looks similar to:

```JS
const { DeepImportsCompatPlugin } = require('@rushstack/webpack-deep-imports-compat-plugin');

const configuration = {
  context: __dirname,
  output: {
    path: `${__dirname}/dist`,
    filename: '[name].js',
  },
  target: 'node'
};

DeepImportsCompatPlugin.applyToWebpackConfiguration(configuration, {
  // The name of the bundle that will be generated
  bundleName: 'my-project',
  inFolder: {
    // The folder that contains the input source files
    folderName: 'lib-esnext',
    // Glob patterns for files under `lib-exnext` that should be included in the bundle and the `lib` folder
    includePatterns: ['**/*.js'],
    // Glob patterns for files under `lib-exnext` that should be excluded from the bundle and the `lib` folder
    excludePatterns: ['**/*.test.*', '**/test/**/*', '**/__mocks__/**/*']
  },
  // The name of the folder to which the loose files should be output to
  outFolderName: 'lib'
});

module.exports = configuration;
```

To accomplish this, this plugin adds an entrypoint to a Webpack configuration that points to a generated module
that looks like this:

```JS
export function getPath(p) {
  switch(p) {
    case 'index.js': return require('./index.js');
    case 'otherFileA.js': return require('./otherFileA.js');
    case 'folder/otherFileB.js': return require('./folder/otherFileB.js');
  }
}

```

and generates files in the `lib` folder that look like this:

```JS
// lib/index.js
module.exports = require('../dist/my-project').getPath('index.js');

```

```JS
// lib/otherFileA.js
module.exports = require('../dist/my-project').getPath('otherFileA.js');

```

```JS
// lib/folder/otherFileB.js
module.exports = require('../../dist/my-project').getPath('folder/otherFileB.js');

```

## Usage

In your `webpack.config.js` file, apply this plugin with

```JS
const { DeepImportsCompatPlugin } = require('@rushstack/webpack-deep-imports-compat-plugin');

const configuration = { /* ... */ }

DeepImportsCompatPlugin.applyToWebpackConfiguration(configuration, {
  // The name of the bundle that will be generated
  bundleName: 'my-project',
  inFolder: {
    // The folder that contains the input source files
    folderName: 'lib-esnext',
    // Glob patterns for files under `lib-exnext` that should be included in the bundle and the `lib` folder
    includePatterns: ['**/*.js'],
    // Glob patterns for files under `lib-exnext` that should be excluded from the bundle and the `lib` folder
    excludePatterns: ['**/*.test.*', '**/test/**/*', '**/__mocks__/**/*']
  },
  // The name of the folder to which the loose files should be output to
  outFolderName: 'lib'
});

module.exports = configuration
```

**DO NOT MANUALLY ADD THIS PLUGIN TO YOUR WEBPACK CONFIGURATION'S `plugins` PROPERTY**
