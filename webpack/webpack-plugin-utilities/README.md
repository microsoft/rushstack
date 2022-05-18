# webpack-plugin-utilities

## Installation

`npm install @rushstack/webpack-plugin-utilities --save`

## Overview

This is a collection of utilities for writing webpack plugins

# Usage

```JavaScript
import { VersionDetection } from "@rushstack/webpack-plugin-utilities"

class MyExampleWebpackPlugin {
  constructor() {
    this.pluginName = "MyExampleWebpackPlugin"
  }

  apply(compiler) {
    if (VersionDetection.isWebpack3OrEarlier(compiler)) {
      throw new Error(`This plugin does not support webpack 3 or below.`)
    }

    const isWebpack4 = VersionDetection.isWebpack4(compiler);

    if (isWebpack4) {
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