# @microsoft/webpack5-load-themed-styles-loader

## Installation

`npm install @microsoft/webpack5-load-themed-styles-loader --save-dev`

## Overview

This simple Webpack loader that wraps the loading of CSS in script equivalent
to `require("@microsoft/load-themed-styles").loadStyles( /* css text */ )`.
It is designed to be a replacement for style-loader.

## Usage

[Documentation: Using loaders](http://webpack.github.io/docs/using-loaders.html)

This loader is designed to be used in conjunction with css-loader.

``` javascript
var css = require("@microsoft/webpack5-load-themed-styles-loader!css!./file.css");
// => returns css code from file.css, uses load-themed-styles to load the CSS on the page.
```

### Example config

``` javascript
        use: [
          {
            loader: "@microsoft/webpack5-load-themed-styles-loader",  // creates style nodes from JS strings
            options: {
              async: false
            }
          },
          {
            loader: "css-loader", // translates CSS into CommonJS
            options: {
              modules: true,
              importLoaders: 2,
              localIdentName: '[name]_[local]_[hash:base64:5]',
              minimize: false
            }
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: function () {
                return [
                  require('autoprefixer')
                ];
              }
            }
          },
          {
            loader: "sass-loader",
          }
        ]

```

## Options

### `async` (boolean, defaults to `false`)

By default, `@microsoft/load-themed-styles` loads styles synchronously. This can have adverse performance effects
if many styles are loaded in quick succession. If the `async` option is set to `true`, the `loadStyles` function
is called with the second parameter set to `true`, directing the function to debounce style loading causing fewer
changes to the DOM.


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/webpack/webpack5-loader-load-themed-styles/CHANGELOG.md) - Find
  out what's new in the latest version

`@microsoft/webpack5-load-themed-styles-loader` is part of the [Rush Stack](https://rushstack.io/) family of projects.
