# webpack-plugin-utilities

## Installation

`npm install @rushstack/webpack-plugin-utilities --save-dev`

## Overview

This is a collection of utilities for writing webpack plugins

# Usage

```JavaScript
import { isWebpack3OrEarlier, isWebpack4Or5 } from "@rushstack/webpack-plugin-utilities"

class MyExampleWebpackPlugin {
  constructor() {
    this.pluginName = "MyExampleWebpackPlugin"
  }

  apply(compiler) {
    if (isWebpack3OrEarlier(compiler)) {
      throw new Error(`This plugin does not support webpack 3 or below.`)
    }

    const webpackVersion = isWebpack4Or5(compiler);

    if (webpackVersion === 4) {
      compiler.hooks.compilation.tap(this.pluginName, (compilation) => {
        // ....
      });
    } else {
      compiler.hooks.compilation.tap(this.pluginName, (compilation) => {
        // ...
      });
    }
  }
}
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/webpack/webpack-plugin-utilities/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/webpack-plugin-utilities` is part of the [Rush Stack](https://rushstack.io/) family of projects.