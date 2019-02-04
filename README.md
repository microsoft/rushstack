# web-build-tools

[![Join the chat at https://gitter.im/web-build-tools/Lobby](https://badges.gitter.im/web-build-tools/Lobby.svg)](https://gitter.im/web-build-tools/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

[![Build Status](https://dev.azure.com/RushStack/web-build-tools%20(GitHub)/_apis/build/status/CI%20Build?branchName=master)](https://dev.azure.com/RushStack/web-build-tools%20(GitHub)/_build/latest?definitionId=3&branchName=master)

_**This repo hosts a collection of tools and libraries used to build web projects at Microsoft.**_

- **[CURRENT NEWS](https://github.com/Microsoft/web-build-tools/wiki)**:  See what's happening with the **web-build-tools** projects!

Highlighted projects:

- **[API Extractor](https://api-extractor.com/)** helps you build better TypeScript libraries.  It standardizes your exported API surface, generates your online API reference, and makes it easy to detect and review changes that will impact your API contract.

- **[Gulp Core Build](https://github.com/Microsoft/web-build-tools/wiki/Gulp-Core-Build)**: If you maintain lots of projects, **gulp-core-build** gets you out of the business of maintaining lots of Gulpfiles.  It defines reusable "rigs" that you customize using simple config files with well-defined JSON schemas.

- **[Rush](https://rushjs.io/)**: Want to consolidate all your web projects in one big repo?  Rush is a fast and reliable solution for installing, linking, building, publishing, checking, change log authoring, and anything else that involves a "package.json" file.


# Contributing

This repo welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This repo has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.


# Project Inventory

## Apps

### [@microsoft/api-extractor](./apps/api-extractor/README.md)

Validate, document, and review the exported API for a TypeScript library.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg)](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
[![Dependencies](https://david-dm.org/Microsoft/api-extractor.svg)](https://david-dm.org/Microsoft/api-extractor)

### [@microsoft/api-documenter](./apps/api-documenter/README.md)

Read JSON files from **api-extractor**, generate documentation pages.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg)](https://badge.fury.io/js/%40microsoft%2Fapi-documenter)
[![Dependencies](https://david-dm.org/Microsoft/api-extractor.svg)](https://david-dm.org/Microsoft/api-documenter)

### [@microsoft/rush](./apps/rush/README.md)

The professional solution for consolidating all your JavaScript projects in one Git repo.

[![npm version](https://badge.fury.io/js/%40microsoft%2Frush.svg)](https://badge.fury.io/js/%40microsoft%2Frush)
[![Dependencies](https://david-dm.org/Microsoft/rush.svg)](https://david-dm.org/Microsoft/rush)

### [@microsoft/rush-lib](./apps/rush-lib/README.md)

A library for scripts that interact with the Rush tool.

[![npm version](https://badge.fury.io/js/%40microsoft%2Frush-lib.svg)](https://badge.fury.io/js/%40microsoft%2Frush-lib)
[![Dependencies](https://david-dm.org/Microsoft/rush-lib.svg)](https://david-dm.org/Microsoft/rush-lib)


## Core Build: Tasks

### [@microsoft/gulp-core-build](./core-build/gulp-core-build/README.md)

Defines the build task model, config file parser, and rig framework for the **Gulp Core Build** system, along with some essential build tasks.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build.svg)](https://david-dm.org/Microsoft/gulp-core-build)

### [@microsoft/gulp-core-build-mocha](./core-build/gulp-core-build-mocha/README.md)

A build task for running unit tests using `mocha` + `chai`. This setup is useful for unit testing build tools, as it runs in the NodeJS process rather than in a browser.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-mocha.svg)](https://badge.fury.io/js/gulp-core-build-mocha)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-mocha.svg)](https://david-dm.org/Microsoft/gulp-core-build-mocha)

### [@microsoft/gulp-core-build-sass](./core-build/gulp-core-build-sass/README.md)

A build task which processes scss files using SASS, runs them through `postcss`, and produces CommonJS/AMD modules which are injected using the `@microsoft/load-themed-styles` package.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-sass.svg)](https://david-dm.org/Microsoft/gulp-core-build-sass)

### [@microsoft/gulp-core-build-serve](./core-build/gulp-core-build-serve/README.md)

A build task for testing/serving web content on the localhost, and live reloading it when things change.  This drives the `gulp serve` experience.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-serve)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-serve.svg)](https://david-dm.org/Microsoft/gulp-core-build-serve)

### [@microsoft/gulp-core-build-typescript](./core-build/gulp-core-build-typescript/README.md)

Build tasks for invoking the TypeScript compiler, `tslint`, and [api-extractor](https://github.com/Microsoft/web-build-tools/wiki/API-Extractor).

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-typescript.svg)](https://david-dm.org/Microsoft/gulp-core-build-typescript)

### [@microsoft/gulp-core-build-webpack](./core-build/gulp-core-build-webpack/README.md)

A build task which introduces the ability to bundle various source files into a set of bundles using `webpack`.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-webpack)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-webpack.svg)](https://david-dm.org/Microsoft/gulp-core-build-webpack)

## Core Build: Rigs

### [@microsoft/node-library-build](./core-build/node-library-build/README.md)

A **Gulp Core Build** rig which provides basic functionality for building and unit testing TypeScript projects intended to run under NodeJS.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fnode-library-build.svg)](https://badge.fury.io/js/%40microsoft%2Fnode-library-build)
[![Dependencies](https://david-dm.org/Microsoft/node-library-build.svg)](https://david-dm.org/Microsoft/node-library-build)

### [@microsoft/web-library-build](./core-build/web-library-build/README.md)

A **Gulp Core Build** rig for building web libraries. It includes build tasks for processing css, typescript, serving, and running browser tests using jest.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fweb-library-build.svg)](https://badge.fury.io/js/%40microsoft%2Fweb-library-build)
[![Dependencies](https://david-dm.org/Microsoft/web-library-build.svg)](https://david-dm.org/Microsoft/web-library-build)


## Libraries

### [@microsoft/load-themed-styles](./libraries/load-themed-styles/README.md)

Loads a string of style rules, but supports detokenizing theme constants built within it.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fload-themed-styles.svg)](https://badge.fury.io/js/%40microsoft%2Fload-themed-styles)
[![Dependencies](https://david-dm.org/Microsoft/load-themed-styles.svg)](https://david-dm.org/Microsoft/load-themed-styles)


### [@microsoft/node-core-library](./libraries/node-core-library/README.md)

Essential libraries that every NodeJS toolchain project should use.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fnode-core-library.svg)](https://badge.fury.io/js/%40microsoft%2Fnode-core-library)
[![Dependencies](https://david-dm.org/Microsoft/node-core-library.svg)](https://david-dm.org/Microsoft/node-core-library)

### [@microsoft/package-deps-hash](./libraries/package-deps-hash/README.md)

`package-deps-hash` is mainly used by Rush.  It generates a JSON file containing the Git hashes of all input files used to build a given package.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fpackage-deps-hash.svg)](https://badge.fury.io/js/%40microsoft%2Fpackage-deps-hash)
[![Dependencies](https://david-dm.org/Microsoft/package-deps-hash.svg)](https://david-dm.org/Microsoft/package-deps-hash)

### [@microsoft/stream-collator](./libraries/stream-collator/README.md)

Oftentimes, when working with multiple parallel asynchronous processes, it is helpful to ensure that their
outputs are not mixed together, as this can cause readability issues in the console or log. The
stream-collator manages the output of these streams carefully, such that no two streams are writing
at the same time.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fstream-collator.svg)](https://badge.fury.io/js/%40microsoft%2Fstream-collator)
[![Dependencies](https://david-dm.org/Microsoft/stream-collator.svg)](https://david-dm.org/Microsoft/stream-collator)

### [@microsoft/ts-command-line](./libraries/ts-command-line/README.md)

An object-oriented command-line parser for TypeScript projects,
based on the [argparse](https://www.npmjs.com/package/argparse)
engine.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fts-command-line.svg)](https://badge.fury.io/js/%40microsoft%2Fts-command-line)
[![Dependencies](https://david-dm.org/Microsoft/ts-command-line.svg)](https://david-dm.org/Microsoft/ts-command-line)


## Webpack Loaders and Plugins

### [@microsoft/set-webpack-public-path-plugin](./webpack/set-webpack-public-path-plugin/README.md)

`set-webpack-public-path-plugin` is a plugin used to set the webpack public path variable.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fset-webpack-public-path-plugin.svg)](https://badge.fury.io/js/%40microsoft%2Fset-webpack-public-path-plugin)
[![Dependencies](https://david-dm.org/Microsoft/set-webpack-public-path-plugin.svg)](https://david-dm.org/Microsoft/set-webpack-public-path-plugin)

### [@microsoft/resolve-chunk-plugin](./webpack/resolve-chunk-plugin/README.md)

`resolve-chunk-plugin` is a plugin that looks for calls to `resolveChunk` with a chunk
name, and returns the chunk ID.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fresolve-chunk-plugin.svg)](https://badge.fury.io/js/%40microsoft%2Fresolve-chunk-plugin)
[![Dependencies](https://david-dm.org/Microsoft/resolve-chunk-plugin.svg)](https://david-dm.org/Microsoft/resolve-chunk-plugin)

### [@microsoft/loader-set-webpack-public-path](./webpack/loader-set-webpack-public-path/README.md)

`loader-set-webpack-public-path` is a loader used to set the webpack public path variable. It's similar to `set-webpack-public-path-plugin`.

[![npm version](https://badge.fury.io/js/%40microsoft%2Floader-set-webpack-public-path.svg)](https://badge.fury.io/js/%40microsoft%2Floader-set-webpack-public-path)
[![Dependencies](https://david-dm.org/Microsoft/loader-set-webpack-public-path.svg)](https://david-dm.org/Microsoft/loader-set-webpack-public-path)

### [@microsoft/loader-load-themed-styles](./webpack/loader-load-themed-styles/README.md)

`loader-load-themed-styles` is a loader used for loading themed CSS styles.

[![npm version](https://badge.fury.io/js/%40microsoft%2Floader-load-themed-styles.svg)](https://badge.fury.io/js/%40microsoft%2Floader-load-themed-styles)
[![Dependencies](https://david-dm.org/Microsoft/loader-load-themed-styles.svg)](https://david-dm.org/Microsoft/loader-load-themed-styles)

### [@microsoft/loader-raw-script](./webpack/loader-raw-script/README.md)

`loader-raw-script` is a loader used for loading scripts with an `eval` statement.

[![npm version](https://badge.fury.io/js/%40microsoft%2Floader-raw-script.svg)](https://badge.fury.io/js/%40microsoft%2Floader-raw-script)
[![Dependencies](https://david-dm.org/Microsoft/loader-raw-script.svg)](https://david-dm.org/Microsoft/loader-raw-script)

