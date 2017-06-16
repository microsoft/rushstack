# @microsoft/gulp-core-build-typescript

`gulp-core-build-typescript contains `gulp-core-build` subtasks for compiling and linting TypeScript code.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-typescript.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-typescript)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-typescript.svg)](https://david-dm.org/Microsoft/gulp-core-build-typescript)

# TypescriptTask
## Usage
The task for building TypeScript into JavaScript.

## Config
See the `ITypeScriptTaskConfig` interface for the definition.

### failBuildOnErrors
Fails the build when errors occur.

Default: `true`

### sourceMatch
An array of glob matches for files to be included in the build.

Default:
```javascript
[
  'src/**/*.ts',
  'src/**/*.tsx',
  'typings/main/**/*.ts',
  'typings/main.d.ts',
  'typings/tsd.d.ts',
  'typings/index.d.ts'
]
```

### staticMatch
Array of glob matches for files that should by passed through (copied) to the build output.

Default:
```javascript
[
  'src/**/*.js',
  'src/**/*.json',
  'src/**/*.jsx'
]
```

### reporter
Custom TypeScript reporter.

Should be an interface conforming to:
```typescript
interface IErrorReporter {
  error: (error: ITypeScriptErrorObject) => void
}
```

Default: a custom function which writes errors to the console.

### typescript
Optional override of the typescript compiler. Set this to the result of require('typescript').

Default: `undefined`

### removeCommentsFromJavaScript
Removes comments from all generated `.js` files. Will **not** remove comments from generated `.d.ts` files.

Default: `false`

### emitSourceMaps
If true, creates sourcemap files which are useful for debugging.

Default: `true`

# TSLintTask
## Usage
The task for linting the TypeScript code.

By default, it includes a cache, such that files which have not been updated since the last linting
are not checked again, unless the config or tslint version has changed.

## Config
See the `ITSLintTaskConfig` interface for the definition.

### lintConfig
The tslint configuration object.

Default: `{}`

### rulesDirectory
Directories to search for custom linter rules. An array of glob expressions.

Default: the tslint-microsoft-contrib directory

### sourceMatch
Provides the glob matches for files to be analyzed.

Default: `['src/**/*.ts', 'src/**/*.tsx']`

### reporter
A function which reports errors to the proper location. It should conform to the following interface:

`((result: lintTypes.LintResult, file: gutil.File, options: ITSLintTaskConfig) => void;)`

Defaults to using the base GulpTask's this.fileError() function.

### displayAsWarning
If true, displays warnings as errors. If the reporter function is overwritten, it should reference
this flag.

Default: `false`

### removeExistingRules
If true, the lintConfig rules which were previously set will be removed. This flag is useful
for ensuring that there are no rules activated from previous calls to setConfig().

Default: `false`

### useDefaultConfigAsBase
If false, does not use a default tslint configuration as the basis for creating the list of active rules.

Default: `true`

# RemoveTripleSlashReferencesTask
## Usage
Removes any `/// <reference path='...' />` entries from compiled D.TS files.
This helps mitigate an issue with duplicated typings in TS 1.8.

## Config
*This task has no configuration options.*

# TextTask
Converts text files into JavaScript.

## Usage
## Config
See the `ITextTaskConfig` interface for the definition.

### textMatch
Glob matches for files that should be converted into modules.

Default: `['src/**/*.txt']`

# Usage
To use these tasks in your build setup, simply import the package and add the task to a build task group.

# Examples
Some examples of build packages that use this task:

* [@microsoft/web-library-build](https://github.com/Microsoft/web-library-build)
* [@microsoft/node-library-build](https://github.com/Microsoft/node-library-build)

# Configuring task options

Use the standard "setConfig" method on task instances to set their configuration options. Example:

```typescript
import { typescript } from '@microsoft/gulp-core-build-typescript';

typescript.setConfig({
  typescript: require('typescript')
});
```

# Related projects

[@microsoft/gulp-core-build](https://github.com/Microsoft/gulp-core-build) - An abstraction around gulp that adds simplified serial/parallel task execution and a formal base task interface.

[typescript](https://github.com/Microsoft/typescript) - The TypeScript compiler.

# License

[MIT](https://github.com/Microsoft/gulp-core-build-typescript/blob/master/LICENSE)
