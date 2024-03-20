# webpack-plugin-utilities

## Installation

`npm install @rushstack/webpack-plugin-utilities --save`

## Overview

This is a collection of utilities for writing webpack plugins

# Usage

## VersionDetection

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

## Testing

### `getTestingWebpackCompiler`

```typescript

import { getTestingWebpackCompiler } from "@rushstack/webpack-plugin-utilities"

describe("MyPlugin", () => {
  it("should run", async () => {
    const stats = await getTestingWebpackCompiler("./src/index.ts");

    expect(stats).toBeDefined();
  });
});
```

### `getTestingWebpackCompiler` with additional configuration

If you want to pass in additional configuration to the webpack compiler, you can pass it in as the second parameter to `getTestingWebpackCompiler`.

```typescript
import { getTestingWebpackCompiler } from "@rushstack/webpack-plugin-utilities"

describe("MyPlugin", () => {
  it("should run", async () => {
    const stats = await getTestingWebpackCompiler("./src/index.ts", {
      mode: "production",
    });

    expect(stats).toBeDefined();
  });
});
```

### `getTestingWebpackCompiler` with virtual filesystem

If you want to be able to read, analyze, access the files written to the memory filesystem,
you can pass in a memory filesystem instance to the `memFs` parameter.

```typescript
import { getTestingWebpackCompiler } from "@rushstack/webpack-plugin-utilities"
import { createFsFromVolume, Volume, IFs } from "memfs"
import path from "path"

describe("MyPlugin", () => {
  it("should run", async () => {
    const virtualFileSystem: IFs = createFsFromVolume(new Volume());
    const stats = await getTestingWebpackCompiler(
      `./src/index.ts`,
      {},
      virtualFileSystem
    );

    expect(stats).toBeDefined();
    expect(virtualFileSystem.existsSync(path.join(__dirname, "dist", "index.js"))).toBe(true);
  });
});
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/webpack/webpack-plugin-utilities/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/webpack-plugin-utilities` is part of the [Rush Stack](https://rushstack.io/) family of projects.