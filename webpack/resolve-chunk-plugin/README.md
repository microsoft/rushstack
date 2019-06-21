# resolve-chunk plugin for webpack

## Installation

`npm install @microsoft/resolve-chunk-plugin --save-dev`

## Overview

This is a webpack plugin that looks for calls to `resolveChunk` with a chunk name, and returns the
chunk ID. It's useful for referencing a chunk without making webpack coalesce two chunks.

# Plugin

To use the plugin, add it to the `plugins` array of your Webpack config. For example:

```JavaScript
import { ResolveChunkPlugin } from '@microsoft/resolve-chunk-plugin';

{
  plugins: [
    new ResolveChunkPlugin()
  ]
}
```

# Background

*Note that the following explanation of Webpack compilation is simplified and intentionally
ignores some edge cases for the sake of simplicity*

When you wish to split code into a separate physical file in Webpack, you call a function
called `require.ensure`. The webpack compiler detects instances of these function calls
and splits the code that you specify into a separate "chunk" and wires some code up to
download and evaluate that chunk. For example:

Code you write:
```TypeScript
require.ensure(
  ['./myModule'],
  (require: ((path: string) => IMyModule)) => {
    const myModule: IMyModule = require('./myModule');
    myModule.doStuff();
  },
  'my-chunk'
);
```

Code Webpack produces:
```JavaScript
// Note that the "require" on the following line is never used. It is actually passed as undefined.
//  This may be a bug in webpack.
__webpack_require__.e(3).then((function (require) {
  var myModule = __webpack_require__(172);
  myModule.doStuff();
});
```

The produced code can be written by hand, and, in some cases, must be written by hand to
avoid some side-effects of using Webpack's special functions.

In this example, a couple of "magic" numbers show up. The `3` in `__webpack_require__.e(3)` is
the ID of the named `"my-chunk"`, and the `172` in `__webpack_require__(172)` is the ID of the
`./myModule` module. Webpack provides a function called `require.resolveWeak` to a module's ID,
but no such OOB function exists for resolving the ID of a named chunk. For example, you could
write this code (equivalent to the code above):

Code you write:
```TypeScript
__webpack_chunk_load__(3).then(() => {
  const myModule: IMyModule = __webpack_require__(require.resolveWeak('./myModule');
  myModule.doStuff();
});
```

Code Webpack produces:
```JavaScript
__webpack_require__.e(3).then((function () {
  var myModule = __webpack_require__(172);
  myModule.doStuff();
});
```

Notice that we had to hardcode the chunk ID (`3`), but we were able to use the webpack
`require.resolveWeak` function to get the module's ID.

This plugin solves the issue of hardcoding chunk IDs by providing a similar piece of syntactic
sugar called `resolveChunk`. This function is NOT `require.resolveChunk` in order to avoid
conflicting with the `require` type in TypeScript. The same example code could be written
this way if this plugin is installed:

Code you write:
```TypeScript
__webpack_chunk_load__(resolveChunk('my-chunk')).then(() => {
  const myModule: IMyModule = __webpack_require__(require.resolveWeak('./myModule');
  myModule.doStuff();
});
```

Code Webpack produces:
```JavaScript
__webpack_require__.e(3).then((function () {
  var myModule = __webpack_require__(172);
  myModule.doStuff();
});
```

Please note that in order to use `resolveChunk`, the chunk must have been created by calling
`require.ensure` somewhere else with the chunk's name.
