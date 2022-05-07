# @rushstack/hashed-folder-copy-plugin

## Installation

`npm install @rushstack/hashed-folder-copy-plugin --save-dev`

## Overview

This webpack plugin provides a simple method for copying a folder to the build output
and including a hash in the folder's name, accessible to the bundle's runtime.

## Usage

In your Webpack config, include the plugin in your `plugins` array:

```JavaScript
import { HashedFolderCopyPlugin } from '@rushstack/hashed-folder-copy-plugin';

{
  plugins: [
    new HashedFolderCopyPlugin()
  ]
}
```

and call the `requireFolder` function in your webpack bundle:

```JavaScript
const folderUrl = requireFolder({
  outputFolder: 'my-folder-name_[hash]',
  sources: [
    {
      globsBase: '../assets/',
      globs: ['**/*.png']
    }
  ]
})
```

TypeScript typings are provided for the `requireFolder` function:

```TypeScript
import type { IRequireFolderOptions } from '@rushstack/hashed-folder-copy-plugin';

declare function requireFolder(options: IRequireFolderOptions): string;

const folderUrl: string = requireFolder({
  outputFolder: 'my-folder-name_[hash]',
  sources: [
    {
      globsBase: '../assets/',
      globPatterns: ['**/*.png']
    }
  ]
})
```

The `requireFolder` takes an options object with two properties:

## `outputFolder`

This is the name of the folder to be created in the webpack output folder. Its
name supports a `[hash]` token, which will be replaced with a stable hash of the assets
that are copied to the folder. Note that the `[hash]` token is not required.

## `sources`

This is an array of glob base paths and glob patterns that will be copied to the
output folder. Each entry in this array takes a `globsBase` property, which is the
base path to the folder to be copied, and a `globPatterns` property, which is an array of
glob patterns to be evaluated under the `globsBase` folder. The path in `globsBase`
supports standard Node resolution.

# Example project

See the [example project](https://github.com/microsoft/rushstack/blob/master/build-tests/hashed-folder-copy-plugin-webpack4-test/).

# A note about ambient types

To get the `requireFolder` function type to work in TypeScript, include a reference to
`"@rushstack/hashed-folder-copy-plugin/ambientTypes"` in your `tsconfig.json` file's
`compilerOptions.types` property. For example:

```JSON
{
  "compilerOptions": {
    "types": [
      "webpack-env",
      "@rushstack/hashed-folder-copy-plugin/ambientTypes" // This value, specifically
    ]
  }
}

```
