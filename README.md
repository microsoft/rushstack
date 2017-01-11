# web-build-tools

[![Build Status](https://travis-ci.org/Microsoft/web-build-tools.svg?branch=master)](https://travis-ci.org/Microsoft/web-build-tools)

A collection of NPM packages used to build Microsoft projects.

See individual projects for details:

# Core build tools

### [@microsoft/gulp-core-build](./gulp-core-build/README.md)

`gulp-core-build` is a set of utility functions that makes it easy to create gulp-based build rigs. Instead of having unwieldy unmaintainable gulpfiles in every project, we want the build setup to be as reusable and centralized as possible.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build.svg)](https://david-dm.org/Microsoft/gulp-core-build)

# Standard subtasks

### [@microsoft/gulp-core-build-karma](./gulp-core-build-karma/README.md)

`gulp-core-build-karma` is a `gulp-core-build` subtask for running unit tests using karma/phantomjs/mocha/chai. This setup allows you to run browser based testing.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-karma.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-karma)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-karma.svg)](https://david-dm.org/Microsoft/gulp-core-build-karma)

### [@microsoft/gulp-core-build-mocha](./gulp-core-build-mocha/README.md)

`gulp-core-build-mocha` is a `gulp-core-build` subtask for running unit tests using mocha/chai. This setup is useful for unit testing build tools, as it runs in the node process rather than in a browser.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-mocha.svg)](https://badge.fury.io/js/gulp-core-build-mocha)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-mocha.svg)](https://david-dm.org/Microsoft/gulp-core-build-mocha)

### [@microsoft/gulp-core-build-sass](./gulp-core-build-sass/README.md)

`gulp-core-build-sass` is a `gulp-core-build` subtask which processes scss files using SASS, runs them through postcss, and produces commonjs/amd modules which are injected using the `@microsoft/load-themed-styles` package.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-sass.svg)](https://david-dm.org/Microsoft/gulp-core-build-sass)

### [@microsoft/gulp-core-build-serve](./gulp-core-build-serve/README.md)

`gulp-core-build-serve` is a `gulp-core-build` subtask for testing/serving web content on the localhost, and live reloading it when things change.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-serve.svg)](https://david-dm.org/Microsoft/gulp-core-build-serve)

### [@microsoft/gulp-core-build-typescript](./gulp-core-build-typescript/README.md)

`gulp-core-build-typescript` contains `gulp-core-build` subtasks for compiling and linting TypeScript code.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-typescript.svg)](https://david-dm.org/Microsoft/gulp-core-build-typescript)

### [@microsoft/gulp-core-build-webpack](./gulp-core-build-webpack/README.md)

`gulp-core-build-webpack` is a `gulp-core-build` subtask which introduces the ability to bundle various source files into a set of bundles, using webpack.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-webpack.svg)](https://david-dm.org/Microsoft/gulp-core-build-webpack)

# Build rigs

### [@microsoft/node-library-build](./node-library-build/README.md)

`node-library-build` is a `gulp-core-build` build rig which provides basic functionality for building and unit testing TypeScript projects.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fnode-library-build.svg)](https://badge.fury.io/js/%40microsoft%2Fnode-library-build)
[![Dependencies](https://david-dm.org/Microsoft/node-library-build.svg)](https://david-dm.org/Microsoft/node-library-build)

### [@microsoft/web-library-build](./web-library-build/README.md)

`web-library-build` is a `gulp-core-build` build rig for building web libraries. It includes build subtasks for processing css, typescript, serving, and running browser tests using karma.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fweb-library-build.svg)](https://badge.fury.io/js/%40microsoft%2Fweb-library-build)
[![Dependencies](https://david-dm.org/Microsoft/web-library-build.svg)](https://david-dm.org/Microsoft/web-library-build)


# Utilities

### [@microsoft/api-extractor](./api-extractor/README.md)

`api-extractor` is a utility which can analyze TypeScript source code and extract the public API into a single file (in several formats, such as markdown or .d.ts). This is especially useful when doing API reviews.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg)](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
[![Dependencies](https://david-dm.org/Microsoft/api-extractor.svg)](https://david-dm.org/Microsoft/api-extractor)
