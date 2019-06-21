# raw-script loader for webpack

## Installation

`npm install @microsoft/loader-raw-script --save-dev`

## Overview

This simple loader loads a script file's contents directly in a webpack bundle using an `eval(...)`.

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

``` javascript
require("@microsoft/loader-raw-script!path/to/script.js");
```

## License

MIT (http://www.opensource.org/licenses/mit-license.php)
