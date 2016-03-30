<<<<<<< HEAD
# set-webpack-public-path loader for webpack

## installation

`npm set-webpack-public-path-loader --save-dev`

## Overview

This simple loader sets the __webpack_public_path__ variable to
a value specified in the arguments, appended to the SystemJs baseURL
property.
=======
# load-themed-styles loader for webpack

## installation

`npm install load-themed-styles-loader --save-dev`

## Overview

This simple loader wraps the loading of CSS in script equivalent
to `require("load-themed-styles").loadStyles( /* css text */ )`.
It is designed to be a replacement for style-loader.
>>>>>>> b7536e5887314266451abcf49074ab88d1726410

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

This loader is designed to be used in conjunction with css-loader.

``` javascript
<<<<<<< HEAD
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

Use the specified string as a URL prefix

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
=======
var css = require("load-themed-styles!css!./file.css");
// => returns css code from file.css, uses load-themed-styles to load the CSS on the page.
```

### Example config

This webpack config can load css files, embed small png images as Data Urls and jpg images as files.

``` javascript
module.exports = {
  module: {
    loaders: [
      { test: /\.css$/, loader: "load-themed-styles-loader!css-loader" }
    ]
  }
};
```

## Options

Ths loader does not take any options at present.
>>>>>>> b7536e5887314266451abcf49074ab88d1726410

## License

MIT (http://www.opensource.org/licenses/mit-license.php)