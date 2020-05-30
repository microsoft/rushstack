# Module Minification Plugin for Webpack

## Installation

`npm install @rushstack/module-minifier-plugin --save-dev`

## Overview

This plugin performs minification of production assets on a per-module basis, rather than minifying an entire chunk at a time.
It issues async calls to the minifier for each unique module and each unique set of chunk boilerplate (i.e. the webpack runtime and the structure of the module list).
This improves minification time by:
- Avoiding duplicate work for each module that is included in multiple distinct assets/chunks (this is common with async chunks)
- Handing smaller code chunks to the minifier at a time (AST analysis is superlinear in size of the AST)
- Even single asset builds will likely still contain multiple modules in the final output, which can be split across available CPU cores

## Parallel execution
If running on node 10, you will need to ensure that the `--experimental-workers` flag is enabled.

```js
const { ModuleMinifierPlugin } = require('@rushstack/module-minifier-plugin');
// This is not part of the main export to allow the plugin to be used without 'worker_threads'
const { WorkerPoolMinifier } = require('@rushstack/module-minifier-plugin/lib/WorkerPoolMinifier');

// In your webpack options:
optimization: [
  minimizer: [
    new ModuleMinifierPlugin({
      minifier: new WorkerPoolMinifier()
    })
  ]
]
```

## Synchronous execution
You can also run the ModuleMinifierPlugin in a single-threaded configuration.

```js
// webpack.config.js
const { ModuleMinifierPlugin, SynchronousMinifier } = require('@rushstack/module-minifier-plugin');

// In your webpack options:
optimization: [
  minimizer: [
    new ModuleMinifierPlugin({
      minifier: new SynchronousMinifier()
    })
  ]
]
```