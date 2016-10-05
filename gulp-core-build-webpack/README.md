# @microsoft/gulp-core-build-webpack

`gulp-core-build-webpack` is a `gulp-core-build` subtask which introduces the ability to bundle various source files into a set of bundles, using webpack.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-webpack.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-webpack)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-webpack.svg)](https://david-dm.org/Microsoft/gulp-core-build-webpack)

# Tasks
## WebpackTask

### Description
This task invokes webpack using a consumer-specified `webpack.config.js` on a package.

### Command Line Options
If the `--initwebpack` flag is passed to the command line, this task will initialize a `webpack.config.js` which bundles `lib/index.js` into `dist/{packagename}.js as a UMD module.

### Config
```typescript
interface IWebpackConfig {
  configPath: string;
  config: Webpack.Configuration;
  suppressWarnings: string[];
}
```
* **configPath** used to specify the local package relative path to a `webpack.config.js`
* **config** used to specify a webpack config object. **configPath** takes precidence over this option if it is set and the file it refefences exists.
* **suppressWarnings** used to specify regular expressions or regular expression strings that will prevent logging of a warning if that warning matches.

Usage:
```typescript
build.webpack.setConfig({
  configPath: "./webpack.config.js"
})
```
