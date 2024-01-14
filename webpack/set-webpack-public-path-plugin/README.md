# set-webpack-public-path plugin for webpack

## Installation

`npm install @rushstack/set-webpack-public-path-plugin --save-dev`

## Mode 1: Using the `document.currentScript` API

### Overview

This plugin wraps the entire webpack bundle in an immediately executed function expression (IIFE) that sets a variable
to the value of `document.currentScript` and then injects code that extracts the current script's base path from
the `src` attribute when setting the `__webpack_public_path__` variable.

This is similar to the `output.publicPath = 'auto'` option, but differs in two important ways:

1. It does not contain any fallback logic to look at `<script />` elements
2. It stores the `document.currentScript` value immediately when the bundle is executed, not when
   the runtime is executed. This is important when the bundle's factory function is called by another script, like
   when an AMD output target is produced.

### Plugin

To use the plugin, add it to the `plugins` array of your Webpack config. For example:

```JavaScript
import { SetPublicPathCurrentScriptPlugin } from '@rushstack/set-webpack-public-path-plugin';

{
  plugins: [
    new SetPublicPathCurrentScriptPlugin()
  ]
}
```

### Options

This plugin has no options.

## Mode 2: Automatic public path detection via regular expression

### Overview

This simple plugin uses a specified regular expression or the emitted asset name to set the `__webpack_public_path__`
variable. This is useful for scenarios where the Webpack automatic public path detection does not work. For example,
when emitting AMD-style assets that are initialized by a callback.

### Plugin

To use the plugin, add it to the `plugins` array of your Webpack config. For example:

```JavaScript
import { SetPublicPathPlugin } from '@rushstack/set-webpack-public-path-plugin';

{
  plugins: [
    new SetPublicPathPlugin( /* webpackPublicPathOptions */ )
  ]
}
```

### Options

#### `scriptName = { }`

This parameter is an object that takes three properties: a string property `name`, a boolean property `isTokenized`,
and a boolean property `useAssetName`

The `name` property is a regular expression string that is applied to all script URLs on the page. The last directory
of the URL that matches the regular expression is used as the public path. For example, if the `name` property
is set to `my\-bundle_?[a-zA-Z0-9-_]*\.js` and a script's URL is `https://mycdn.net/files/build_id/assets/my-bundle_10fae182eb.js`,
the public path will be set to `https://mycdn.net/files/build_id/assets/`.

If the `isTokenized` parameter is set to `true`, the regular expression string in `name` is treated as a tokenized
string. The supported tokens are `[name]` and `[hash]`. Instances of the `[name]` substring are replaced with the
chunk's name, and instances of the `[hash]` substring are replaced with the chunk's rendered hash. The name
is regular expression-escaped. For example, if the `name` property is set to `[name]_?[a-zA-Z0-9-_]*\.js`,
`isTokenized` is set to `true`, and the chunk's name is `my-bundle`, and a script's URL is
`https://mycdn.net/files/build_id/assets/my-bundle_10fae182eb.js`, the public path will be set to
`https://mycdn.net/files/build_id/assets/`.

If the `useAssetName` property is set, the plugin will use the Webpack-produced asset name as it would the `name`
property. `useAssetName` is exclusive to `name` and `isTokenized`.

This option is exclusive to other options. If it is set, `systemJs`, `publicPath`, and `urlPrefix` will be ignored.

##### `regexVariable = '...'`

Check for a variable with name `...` on the page and use its value as a regular expression against script paths to
the bundle's script. If a value `foo` is passed into `regexVariable`, the produced bundle will look for a variable
called `foo` during initialization, and if a `foo` variable is found, use its value as a regular expression to
detect the bundle's script.

For example, if the `regexVariable` option is set to `scriptRegex` and `scriptName` is set to `{ name: 'myscript' }`,
consider two cases:

###### Case 1

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

###### Case 2

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

##### `getPostProcessScript = (variableName) => { ... }`

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

##### `preferLastFoundScript = false`

If true, find the last script matching the regexVariable (if it is set). If false, find the first matching script.
This can be useful if there are multiple scripts loaded in the DOM that match the regexVariable.
