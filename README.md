# web-build-tools

[![Build Status](https://travis-ci.org/Microsoft/web-build-tools.svg?branch=master)](https://travis-ci.org/Microsoft/web-build-tools)

A collection of NPM packages used to build Microsoft projects.

_**For documentation, see the [web-build-tools wiki](https://github.com/Microsoft/web-build-tools/wiki).**_


## Apps

### [@microsoft/rush](./apps/rush/README.md)

`rush` is a utility for cross-linking, building, and releasing multiple NPM packages.

[![npm version](https://badge.fury.io/js/%40microsoft%2Frush.svg)](https://badge.fury.io/js/%40microsoft%2Frush)
[![Dependencies](https://david-dm.org/Microsoft/rush.svg)](https://david-dm.org/Microsoft/rush)

### [@microsoft/rush-lib](./apps/rush-lib/README.md)

`rush-lib` is a library for interacting with a repository which is using `rush`.

[![npm version](https://badge.fury.io/js/%40microsoft%2Frush-lib.svg)](https://badge.fury.io/js/%40microsoft%2Frush-lib)
[![Dependencies](https://david-dm.org/Microsoft/rush-lib.svg)](https://david-dm.org/Microsoft/rush-lib)

## Core Build: Tasks

### [@microsoft/gulp-core-build](./core-build/gulp-core-build/README.md)

`gulp-core-build` is a set of utility functions that makes it easy to create gulp-based build rigs. Instead of having unwieldy unmaintainable gulpfiles in every project, we want the build setup to be as reusable and centralized as possible.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build.svg)](https://david-dm.org/Microsoft/gulp-core-build)



### [@microsoft/gulp-core-build-karma](.core-build/gulp-core-build-karma/README.md)

`gulp-core-build-karma` is a `gulp-core-build` subtask for running unit tests using karma/phantomjs/mocha/chai. This setup allows you to run browser based testing.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-karma.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-karma)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-karma.svg)](https://david-dm.org/Microsoft/gulp-core-build-karma)

### [@microsoft/gulp-core-build-mocha](./core-build/gulp-core-build-mocha/README.md)

`gulp-core-build-mocha` is a `gulp-core-build` subtask for running unit tests using mocha/chai. This setup is useful for unit testing build tools, as it runs in the node process rather than in a browser.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-mocha.svg)](https://badge.fury.io/js/gulp-core-build-mocha)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-mocha.svg)](https://david-dm.org/Microsoft/gulp-core-build-mocha)

### [@microsoft/gulp-core-build-sass](./core-build/gulp-core-build-sass/README.md)

`gulp-core-build-sass` is a `gulp-core-build` subtask which processes scss files using SASS, runs them through postcss, and produces commonjs/amd modules which are injected using the `@microsoft/load-themed-styles` package.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-sass.svg)](https://david-dm.org/Microsoft/gulp-core-build-sass)

### [@microsoft/gulp-core-build-serve](./core-build/gulp-core-build-serve/README.md)

`gulp-core-build-serve` is a `gulp-core-build` subtask for testing/serving web content on the localhost, and live reloading it when things change.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-serve.svg)](https://david-dm.org/Microsoft/gulp-core-build-serve)

### [@microsoft/gulp-core-build-typescript](./core-build/gulp-core-build-typescript/README.md)

`gulp-core-build-typescript` contains `gulp-core-build` subtasks for compiling and linting TypeScript code.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-typescript.svg)](https://david-dm.org/Microsoft/gulp-core-build-typescript)

### [@microsoft/gulp-core-build-webpack](./core-build/gulp-core-build-webpack/README.md)

`gulp-core-build-webpack` is a `gulp-core-build` subtask which introduces the ability to bundle various source files into a set of bundles, using webpack.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-webpack.svg)](https://david-dm.org/Microsoft/gulp-core-build-webpack)

## Core Build: Rigs

### [@microsoft/node-library-build](./core-build/node-library-build/README.md)

`node-library-build` is a `gulp-core-build` build rig which provides basic functionality for building and unit testing TypeScript projects.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fnode-library-build.svg)](https://badge.fury.io/js/%40microsoft%2Fnode-library-build)
[![Dependencies](https://david-dm.org/Microsoft/node-library-build.svg)](https://david-dm.org/Microsoft/node-library-build)

### [@microsoft/web-library-build](./core-build/web-library-build/README.md)

`web-library-build` is a `gulp-core-build` build rig for building web libraries. It includes build subtasks for processing css, typescript, serving, and running browser tests using karma.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fweb-library-build.svg)](https://badge.fury.io/js/%40microsoft%2Fweb-library-build)
[![Dependencies](https://david-dm.org/Microsoft/web-library-build.svg)](https://david-dm.org/Microsoft/web-library-build)

## Libraries

### [@microsoft/api-extractor](./libraries/api-extractor/README.md)

`api-extractor` is a utility which can analyze TypeScript source code and extract the public API into a single file (in several formats, such as markdown or .d.ts). This is especially useful when doing API reviews.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg)](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
[![Dependencies](https://david-dm.org/Microsoft/api-extractor.svg)](https://david-dm.org/Microsoft/api-extractor)

### [@microsoft/node-core-library](./libraries/node-core-library/README.md)

`node-core-library` provides essential libraries that every NodeJS toolchain project should use.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fnode-core-library.svg)](https://badge.fury.io/js/%40microsoft%2Fnode-core-library)
[![Dependencies](https://david-dm.org/Microsoft/node-core-library.svg)](https://david-dm.org/Microsoft/node-core-library)

### [@microsoft/package-deps-hash](./libraries/package-deps-hash/README.md)

`package-deps-hash` is mainly used by Rush.  It generates a JSON file containing the Git hashes
of all input files used to build a given package.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fpackage-deps-hash.svg)](https://badge.fury.io/js/%40microsoft%2Fpackage-deps-hash)
[![Dependencies](https://david-dm.org/Microsoft/package-deps-hash.svg)](https://david-dm.org/Microsoft/package-deps-hash)
