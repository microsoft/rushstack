# set-webpack-public-path loader for webpack

## installation

`npm set-webpack-public-path-loader --save-dev`

## Overview

This simple loader sets the `__webpack_public_path__` variable to
a value specified in the arguments, optionally appended to the SystemJs baseURL
property.

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

``` javascript
require("set-webpack-public-path!");
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
var setWebpackPublicPath = require('set-webpack-public-path-loader');
setWebpackPublicPath.setOptions({
  systemJs: true,
  urlPrefix: process.env.BUILD_BUILDNUMBER
});
```

Inline options override options set in the webpack.config.

## License

MIT (http://www.opensource.org/licenses/mit-license.php)
