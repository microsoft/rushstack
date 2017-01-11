# @microsoft/gulp-core-build-sass

`gulp-core-build-sass` is a `gulp-core-build` subtask which processes scss files using SASS, runs them through postcss, and produces commonjs/amd modules which are injected using the `@microsoft/load-themed-styles` package.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-sass)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-sass.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-sass) [![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-sass.svg)](https://david-dm.org/Microsoft/gulp-core-build-sass)

# SassTask

## Usage
This task invokes `gulp-sass` to compile source SASS files into a CommonJS module which uses `load-themed-styles` to load styles onto the page. If the `libAmdFolder` is specified globally, this task will also output an AMD module. Various templates may be specified.

## Config
### preamble
An optional parameter for text to include in the generated typescript file.

**Default:** `'/* tslint:disable */'`

### postamble
An optional parameter for text to include at the end of the generated typescript file.

**Default:** `'/* tslint:enable */'`

### sassMatch
An array of glob patterns for locating SASS files.

**Default:** `['src/**/*.scss']`

### useCSSModules
If this option is specified, ALL files will be treated as a `module.scss` and will
automatically generate a corresponding TypeScript file. All classes will be
appended with a hash to help ensure uniqueness on a page. This file can be
imported directly, and will contain an object describing the mangled class names.

**Default:** `false`

### dropCssFiles
If this is false, then we do not create `.css` files in the `lib` directory.

**Default:** `false`

### warnOnNonCSSModules
If files are matched by sassMatch which do not end in .module.scss, log a warning.

**Default:** `false`

# License

MIT