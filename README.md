# set-webpack-public-path loader for webpack

## installation

`npm set-webpack-public-path-loader --save-dev`

## Overview

This simple loader sets the __webpack_public_path__ variable to
a value specified in the arguments, appended to the SystemJs baseURL
property.

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

This loader is designed to be used in conjunction with css-loader.

``` javascript
require("set-webpack-public-path!");
```

## Options

### Inline Loader Options

#### `systemJs`

Use `System.baseURL` if it is defined.

#### `scriptPath=...`

Search through all script URLs on the page and use the last directory of the URL that contains the specified string.

This option is exclusive to other options. If it is set, systemJs and urlPrefix will be ignored.

#### `urlPrefix=...`

Use the specified string as a URL prefix.

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