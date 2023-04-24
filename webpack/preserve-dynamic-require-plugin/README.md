# @rushstack/webpack-preserve-dynamic-require-plugin

## Overview

This Webpack plugin instructs webpack to leave dynamic usage of `require` as-is in the bundled code. For example, if your code contains:
```js
function requireSomeUserThing(path) {
  return require(path);
}
```
The emitted bundle will preserve the call to `require(path)` instead of trying to process it.
