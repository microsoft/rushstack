# set-webpack-public-path loader for webpack

## Installation

`npm install @microsoft/loader-set-webpack-public-path --save-dev`

## Overview

This simple loader sets the `__webpack_public_path__` variable to
a value specified in the arguments, optionally appended to the SystemJs baseURL
property.

### Important note about Webpack 2.X

Webpack's `resolveLoader.root` property was [removed](https://webpack.js.org/guides/migrating/#loaders-in-configuration-resolve-relative-to-context)
in webpack 2.X. This has an unfortunate side-effect for standardardized build configurations like
[gulp-core-build](https://github.com/Microsoft/web-build-tools) build rigs with loaders in the rig's
`package.json`, but not in the `package.json` of the project being built. This side-effect causes these
loaders to not be resolved under some circumstances. In order to work around this, we recommend you use the
[Webpack plugin](https://www.npmjs.com/package/@microsoft/set-webpack-public-path-plugin) instead of this loader.

# Loader

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

``` javascript
require("@microsoft/loader-set-webpack-public-path!");
```

## Options

### Inline Loader Options

#### `scriptName=...`

This property is a string of a regular expression string that is applied to all script URLs on the page. The last directory
of the URL that matches the regular expression is used as the public path. For example, if this property
is set to `my\-bundle_?[a-zA-Z0-9-_]*\.js` and a script's URL is `https://mycdn.net/files/build_id/assets/my-bundle_10fae182eb.js`,
the public path will be set to `https://mycdn.net/files/build_id/assets/`.

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

#### `regexVariable = '...'`

Check for a variable with name `...` on the page and use its value as a regular expression against script paths to
the bundle's script. If a value `foo` is passed into `regexVariable`, the produced bundle will look for a variable
called `foo` during initialization, and if a `foo` variable is found, use its value as a regular expression to
detect the bundle's script.

For example, if the `regexVariable` option is set to `scriptRegex` and `scriptName` is set to `{ name: 'myscript' }`,
consider two cases:

##### Case 1

```HTML
<html>
  <head>
    <script>
      var scriptRegex = /thescript/i;
    </script>
    <script src="theScript.js"></script>
  </head>

  ...
</html>
```

In this case, because there is a `scriptRegex` variable defined on the page, the bundle will use its value
(`/thescript/i`) to find the script.

##### Case 2

```HTML
<html>
  <head>
    <script src="myScript.js"></script>
  </head>

  ...
</html>
```

In this case, because there is not a `scriptRegex` variable defined on the page, the bundle will use the value
passed into the `scriptName` option to find the script.

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

# SystemJS Caveat

When modules are loaded with SystemJS (and with the , `scriptLoad: true` meta option) `<script src="..."></script>`
tags are injected onto the page, evaludated and then immediately removed. This causes an issue because they are removed
before webpack module code begins to execute, so the `publicPath=...` option won't work for modules loaded with SystemJS.

To circumvent this issue, a small bit of code is availble to that will maintain a global register of script paths
that have been inserted onto the page. This code block should be appended to bundles that are expected to be loaded
with SystemJS and use the `publicPath=...` option.

## `getGlobalRegisterCode(bool)`

This function returns a block of JavaScript that maintains a global register of script tags. If the optional boolean paramter
is set to `true`, the code is not minified. By default, it is minified.

## Usage

``` javascript
var setWebpackPublicPath = require('@microsoft/loader-set-webpack-public-path');
var gulpInsert = require('gulp-insert');

gulp.src('finizlied/webpack/bundle/path')
  .pipe(gulpInsert.append(setWebpackPublicPath.getGlobalRegisterCode(true)))
  .pipe(gulp.dest('dest/path'));
```

# License

MIT (http://www.opensource.org/licenses/mit-license.php)
