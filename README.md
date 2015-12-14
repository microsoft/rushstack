# gulp-core-build

Common Gulp tasks to support building and testing web apps/libraries. This sets up the basic build tasks so you don't have to.

This set of tasks gives you the following build support:

* Build TypeScript files in /src and drop them to lib
* Build LESS files and automatically export them as commonjs modules in lib
* TS linting run against code

# Usage

Within your project, install gulp and gulp-core-build as dev dependencies:

```
npm install --save-dev gulp gulp-core-build
```

Create a gulpfile.js that calls initializeTasks:

```javascript
'use strict';

let build = require('ms-core-build');

build.initializeTasks(
  require('gulp'), // the gulp instance to use for building
  { ... } // optional settings
);
```

Once this is set up, you should be able to execute general gulp tasks.

# Available tasks

All tasks are executed with gulp using the standard gulp syntax:

```bash
gulp <taskname>
```

Tasks include:

* **build** - Builds the inputs, drops to the output folder.
* **build-watch** - Watches files and auto builds on changes.
* **test** - Builds, and then runs tests.
* **test-watch** - Watches all files and auto builds/runs tests on changes.
* **bundle** - TBD
* **serve** - Spins up a localhost server that lets you browse static pages.
* **nuke** - Deletes build output.

For quick app development, use `gulp serve`. This will spin up the express server and host the content.

For quick library testing flows, use `gulp test-watch`.

# API

# initializeTasks(gulpInstance, [options])

Registers the gulp tasks.

The options are broken down into task-specific sections, and all are optional, so only provide the ones
that require deviating from defaults:

```typescript
build.initializeTasks(
  require('gulp'),
  {
    build: { /* build options */ },
    bundle: { /* bundle options */ },
    test: { /* test options */ },
    serve: { /* serve options */ },
    nuke: { /* nuke options */ }
  });
```

## Build options

### build.paths

Collection of path matches and folder locations for locating the input source and drop directories.

Type: `object`

Default:
```javascript
{
  sourceMatch: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'typings/tsd.d.ts'
  ],
  lessMatch: ['src/**/*.less'],
  htmlMatch: ['src/**/*.html'],
  staticsMatch: [
    'src/**/*.js',
    'src/**/*.css',
    'src/**/*.jpg',
    'src/**/*.png'
  ],
  libFolder: 'lib'
}
```
### build.isLintingEnabled

Type: `boolean`
Default: `true`

### build.lintConfig

Type: `object`
Default: default tslint.json found in gulp-core-build root. Use this to provide your own object.

# Build input

Using default build settings, your repo source should live under the 'src' directory. The default build will support the following formats:

```text
/src
  **/*.ts - Typescript source files
  **/*.test.ts - Typescript test files, which should live next to sources.
  **/*.less - Less css files that get converted into AMD modules that you can require as './filename.css'
  **/*.html - Static HTML files that get minified
  **/*.png - PNGs that get minified
  **/*.jpg - JPEGs that get minified
```


# Build output

Building the source will drop under the 'lib' folder, preserving the directory structure from the src folder:

```text
/lib
  **/* - All unbundled js/static resources will be dropped into lib.
  **/*.d.ts - All typescript definitions will be dropped as well.
```


# Adding custom build tasks to the task dependency tree

In cases where the general build tools don't cover every scenario you have, you can use helpers to inject custom
build steps into the common build task dependencies.

```javascript
let build = require('ms-core-build');

// Create a custom gulp task as you normally would.
gulp.task('build-custom-stuff', () => { ... });

// Register the task to execute before "build" starts, if build things depend on this step.
build.doBefore('build', 'build-custom-stuff');

// Or, register it to execute while "build" is executing, if nothing depends on this step.
build.doDuring('build', 'build-custom-stuff');

// Or, register it to execute after "build" is complete if this step depends on build to be complete.
build.doAfter('build', 'build-custom-stuff');

// After dependencies are registered, initialize core tasks. They will make sure all of the instructions
// you've provided will be merged correctly into the gulp task dependencies.
build.initializeTasks(
  _dirname,
  require('gulp')
);
```







