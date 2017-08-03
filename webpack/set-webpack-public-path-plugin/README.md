# set-webpack-public-path plugin for webpack

## Installation

`npm @microsoft/set-webpack-public-path-plugin --save-dev`

## Overview

This simple plugin sets the `__webpack_public_path__` variable to
a value specified in the arguments, optionally appended to the SystemJs baseURL
property.

# Plugin

To use the plugin, add it to the `plugins` array of your Webpack config. For example:

```JavaScript
import { SetPublicPathPlugin } from '@microsoft/set-webpack-public-path-plugin';

{
  plugins: [
    new SetPublicPathPlugin( /* webpackPublicPathOptions */ )
  ]
}
```

## Options

#### `scriptName = { }`

This parameter is an object that takes two properties: a string property `name`, and a boolean property `isTokenized`.
The `name` property is a regular expression string that is applied to all script URLs on the page. The last directory
of the URL that matches the regular expression is used as the public path. For example, if the `name` property
is set to `my\-bundle_?[a-zA-Z0-9-_]*\.js` and a script's URL is `https://mycdn.net/files/build_id/assets/my-bundle_10fae182eb.js`,
the public path will be set to `https://mycdn.net/files/build_id/assets/`.

If the `isTokenized` paramter is set to `true`, the regular expression string in `name` is treated as a tokenized
string. The supported tokens are `[name]` and `[hash]`. Instances of the `[name]` substring are replaced with the
chunk's name, and instances of the `[hash]` substring are replaced with the chunk's rendered hash. The name
is regular expression-escaped. For example, if the `name` property is set to `[name]_?[a-zA-Z0-9-_]*\.js`,
`isTokenized` is set to `true`, and the chunk's name is `my-bundle`, and a script's URL is
`https://mycdn.net/files/build_id/assets/my-bundle_10fae182eb.js`, the public path will be set to
`https://mycdn.net/files/build_id/assets/`.

This option is exclusive to other options. If it is set, `systemJs`, `publicPath`, and `urlPrefix` will be ignored.

#### `systemJs = true`

Use `System.baseURL` if it is defined.

#### `publicPath = '...'`

Use the specified path as the base public path. If `urlPrefix` is also defined, the public path will
be the concatenation of the two (i.e. - `__webpack_public_path__ = URL.concat({publicPath} + {urlPrefix}`).
This option takes precedence over the `systemJs` option.

#### `urlPrefix = '...'`

Use the specified string as a URL prefix after the SystemJS path or the `publicPath` option. If neither
`systemJs` nor `publicPath` is defined, this option will not apply and an exception will be thrown.

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

#### `getPostProcessScript = (variableName) => { ... }`

A function that returns a snippet of code that manipulates the variable with the name that's specified in the
parameter. If this parameter isn't provided, no post-processing code is included. The variable must be modified
in-place - the processed value should not be returned. This is useful when non-entry assets are deployed to
a parent directory or subdirectory of the directory to which the entry assets are deployed.

For example, if this parameter is set to this function

```JavaScript
getPostProcessScript = (variableName) => {
  return `${variableName} = ${variableName} + 'assets/';`;
};
```

the public path variable will have `/assets/` appended to the found path.

Note that the existing value of the variable already ends in a slash (`/`).

# SystemJS Caveat

When modules are loaded with SystemJS (and with the , `scriptLoad: true` meta option) `<script src="..."></script>`
tags are injected onto the page, evaludated and then immediately removed. This causes an issue because they are removed
before webpack module code begins to execute, so the `publicPath=...` option won't work for modules loaded with SystemJS.

To circumvent this issue, a small bit of code is availble to that will maintain a global register of script paths
that have been inserted onto the page. This code block should be appended to bundles that are expected to be loaded
with SystemJS and use the `publicPath=...` option.

## `getGlobalRegisterCode(bool)`

This function returns a block of JavaScript that maintains a global register of script tags. If the optional boolean parameter
is set to `true`, the code is not minified. By default, it is minified. You can detect if the plugin may require
the global register code by searching for the value of the `registryVariableName` field.

## Usage without registryVariableName

``` javascript
var setWebpackPublicPath = require('@microsoft/set-webpack-public-path-plugin');
var gulpInsert = require('gulp-insert');

gulp.src('finizlied/webpack/bundle/path')
  .pipe(gulpInsert.append(setWebpackPublicPath.getGlobalRegisterCode(true)))
  .pipe(gulp.dest('dest/path'));
```

## Usage with registryVariableName

``` javascript
var setWebpackPublicPath = require('@microsoft/set-webpack-public-path-plugin');
var gulpInsert = require('gulp-insert');
var gulpIf = require('gulp-if');

var detectRegistryVariableName = function (file) {
  return file.contents.toString().indexOf(setWebpackPublicPath.registryVariableName) !== -1;
};

gulp.src('finizlied/webpack/bundle/path')
  .pipe(gulpIf(detectRegistryVariableName, gulpInsert.append(setWebpackPublicPath.getGlobalRegisterCode(true))))
  .pipe(gulp.dest('dest/path'));
```

# License

MIT (http://www.opensource.org/licenses/mit-license.php)
