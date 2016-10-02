# @microsoft/gulp-core-build-typescript

`gulp-core-build-typescript contains `gulp-core-build` subtasks for compiling and linting TypeScript code.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-typescript)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-typescript.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-typescript)
[![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-typescript.svg)](https://david-dm.org/Microsoft/gulp-core-build-typescript)

# Usage

This collection of tasks is designed to be used with a gulp-core-build based build setup. It abstracts the TypeScript based build tasks used to build typescript code.

The tasks exported are:

* `typescript` - The task for building TypeScript into JavaScript.
* `tslint` - The task for linting the TypeScript code.
* `text` - Converts text files into JavaScript.

To use these tasks in your build setup, simply import the package and add the task to a build task group.

```typescript
import { task, serial, parallel, watch, CopyTask, IExecutable } from '@microsoft/gulp-core-build';
import { typescript, tslint, text } from '@microsoft/gulp-core-build-typescript';

export * from '@microsoft/gulp-core-build';
export * from '@microsoft/gulp-core-build-typescript';

// Examples of creating some copy tasks to be run pre/post build.
export const preCopy: CopyTask = new CopyTask();
preCopy.name = 'pre-copy';

export const postCopy: CopyTask = new CopyTask();
postCopy.name = 'post-copy';

// Define a task group.
task('build', serial(preCopy, parallel(tslint, typescript, text), postCopy));
```

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

## `typescript` task options

See the `ITypeScriptTaskConfig` interface for the definition.

* `failBuildOnErrors` (boolean, default: true) - Fails the build when errors occur.
* `sourceMatch` (string[]) - Glob matches for files to be included in the build.
* `staticMatch` (string[]) - Files that should by passed through (copied) to the build output.
* `reporter` - Custom TypeScript reporter.
* `typescript` - Optional override of the typescript compiler. Set this to the result of require('typescript').

## `tslint` task options

See the `ITSLintTaskConfig` interface for the definition.

* `lintConfig` (Object) - The tslint configuration object.
* `rulesDirectory` (string | string[]) - Directories to search for custom linter rules
* `sourceMatch` (string[]) - Provides the glob matches for files to be analyzed.
* `reporter` ((result: lintTypes.LintResult, file: gutil.File, options: ITSLintTaskConfig) => void;) - A function which reports errors to the proper location. Defaults to using the base GulpTask's this.fileError() function.
* `displayAsWarning` (boolean, default: false) - If true, displays warnings as errors. If the reporter function is overwritten, it should reference
* `remoteExistingRules` (boolean, default: false) - If true, the lintConfig rules which were previously set will be removed. This flag is useful for ensuring that there are no rules activated from previous calls to setConfig().
* `useDefaultConfigAsBase` (boolean, default: true) - If false, does not use a default tslint configuration as the basis for creating the list of active rules.

## `text` task options

See the `ITextTaskConfig` interface for the definition.

* `textMatch` (string[]) - Glob matches for files that should be converted into modules.

# Related projects

[@microsoft/gulp-core-build](https://github.com/Microsoft/gulp-core-build) - An abstraction around gulp that adds simplified serial/parallel task execution and a formal base task interface.

[typescript](https://github.com/Microsoft/typescript) - The TypeScript compiler.

# License

[MIT](https://github.com/Microsoft/gulp-core-build-typescript/blob/master/LICENSE)
