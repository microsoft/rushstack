# @rushstack/webpack5-module-minifier-plugin

This package contains a plugin for webpack 5 that performs minification on a per-module basis rather than per-asset to deduplicate and parallelize compression work.

## Installation

`npm install @rushstack/webpack5-module-minifier-plugin --save-dev`

## Overview

This Webpack plugin performs minification of production assets on a per-module basis, rather than minifying an entire chunk at a time.
It issues async calls to the minifier for each unique module and each unique set of chunk boilerplate (i.e. the webpack runtime and the structure of the module list).
This improves minification time by:
- Avoiding duplicate work for each module that is included in multiple distinct assets/chunks (this is common with async chunks)
- Handing smaller code chunks to the minifier at a time (AST analysis is superlinear in size of the AST)
- Even single asset builds will likely still contain multiple modules in the final output, which can be split across available CPU cores

## Use with `[hash]` and `[contenthash]` tokens
The plugin will do its best to update webpack hashes if changing the direct inputs (`useSourceMap`) to the plugin, but if altering the `minifier` property itself, you may need to use the `output.hashSalt` property to force a change to the hashes, especially if leveraging the `MessagePortMinifier` or similar, since it has no direct access to the configuration of the minifier.

## Parallel execution

```js
const { ModuleMinifierPlugin } = require('@rushstack/webpack5-module-minifier-plugin');
const { WorkerPoolMinifier } = require('@rushstack/module-minifier');

// In your webpack options:
optimization: {
  minimizer: [
    new ModuleMinifierPlugin({
      minifier: new WorkerPoolMinifier(),
      // If not provided, the plugin will attempt to guess from `mode` and `devtool`.
      // Providing it expressly gives better results
      useSourceMap: true
    })
  ]
}
```

## Single-threaded execution
You can also run the ModuleMinifierPlugin in a single-threaded configuration.

```js
// webpack.config.js
const { ModuleMinifierPlugin } = require('@rushstack/webpack5-module-minifier-plugin');
const { LocalMinifier } = require('@rushstack/module-minifier');

// In your webpack options:
optimization: {
  minimizer: [
    new ModuleMinifierPlugin({
      minifier: new LocalMinifier()
    })
  ]
}
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/webpack/webpack5-module-minifier-plugin/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/webpack5-module-minifier-plugin` is part of the [Rush Stack](https://rushstack.io/) family of projects.
