# load-themed-styles loader for webpack

## installation

`npm install load-themed-styles-loader --save-dev`

## Overview

This simple loader wraps the loading of CSS in script equivalent
to `require("load-themed-styles").loadStyles( /* css text */ )`.
It is designed to be a replacement for style-loader.

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

This loader is designed to be used in conjunction with css-loader.

``` javascript
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

## License

MIT (http://www.opensource.org/licenses/mit-license.php)