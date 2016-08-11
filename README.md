# set-webpack-public-path loader for webpack

## Installation

`npm @microsoft/loader-set-webpack-public-path --save-dev`

## Overview

This simple loader sets the `__webpack_public_path__` variable to
a value specified in the arguments, optionally appended to the SystemJs baseURL
property.

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

``` javascript
require("@microsoft/loader-set-webpack-public-path!");
```

## Options

### Inline Loader Options

#### `scriptPath=...`

Search through all script URLs on the page and use the last directory of the URL that contains the specified string.

This option is exclusive to other options. If it is set, `systemJs`, `publicPath`, and `urlPrefix` will be ignored.

#### `systemJs`

Use `System.baseURL` if it is defined. Setting this option inline will override `scriptPath` set by `setOptions({ ... })`.

#### `publicPath=...`

Use the specified path as the base public path. If `urlPrefix` is also defined, the public path will
be the concatenation of the two (i.e. - `__webpack_public_path__ = URL.concat({publicPath} + {urlPrefix}`).
This option takes precedence over the `systemJs` option.  Setting this option inline will override
`scriptPath` set by `setOptions({ ... })`.

#### `urlPrefix=...`

Use the specified string as a URL prefix after the SystemJS path or the `publicPath` option. If neither
`systemJs` nor `publicPath` is defined, this option will not apply and a warning will be emitted.

### Config, pre-bundle options

Options may also be set before webpack is called. This package returns a singleton,
so you can require the package in your `webpack.config.js` and call `setOptions({ ... })`
to set any of the above options. For example:

``` javascript
var setWebpackPublicPath = require('@microsoft/loader-set-webpack-public-path');

setWebpackPublicPath.setOptions({
  systemJs: true,
  urlPrefix: process.env.BUILD_BUILDNUMBER
});
```

Inline options override options set in the webpack.config.

## SystemJS Caveat

When modules are loaded with SystemJS (and with the , `scriptLoad: true` meta option) `<script src="..."></script>`
tags are injected onto the page, evaludated and then immediately removed. This causes an issue because they are removed
before webpack module code begins to execute, so the `publicPath=...` option won't work for modules loaded with SystemJS.

To circumvent this issue, a small bit of code is availble to that will maintain a global register of script paths
that have been inserted onto the page. This code block should be appended to bundles that are expected to be loaded
with SystemJS and use the `publicPath=...` option.

### `getGlobalRegisterCode(bool)`

This function returns a block of JavaScript that maintains a global register of script tags. If the optional boolean paramter
is set to `true`, the code is not minified. By default, it is minified.

### Usage

``` javascript
var setWebpackPublicPath = require('@microsoft/loader-set-webpack-public-path');
var gulpInsert = require('gulp-insert');

gulp.src('finizlied/webpack/bundle/path')
  .pipe(gulpInsert.append(setWebpackPublicPath.getGlobalRegisterCode(true)))
  .pipe(gulp.dest('dest/path'));
```

## License

MIT (http://www.opensource.org/licenses/mit-license.php)
