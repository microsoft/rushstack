# @microsoft/gulp-core-build

`gulp-core-build` is a set of utility functions that makes it easy to create gulp-based build rigs. Instead of having unweildy unmaintainable gulpfiles in every project, we want the build setup to be as reusable and centralized as possible.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build) [![Dependencies](https://david-dm.org/Microsoft/gulp-core-build.svg)](https://david-dm.org/Microsoft/gulp-core-build)

The gulp build system, along with its rich plugin ecosystem, is a very powerful tool for web development projects.
However project gulp build setups become difficult to manage over time, as gulpfiles grow in complexity. This project
simplifies a number of aspects of getting a build setup going for a majority of scenarios.

Core build defines a contract for tasks to implement, such that they can share opinions about where things end up. Tasks are modular but they are designed to work well together.

With gulp core build, your gulpfile translates into a list of task definitions, each which define what to run:

```typescript
'use strict';

// Import core build and the tasks the project needs.
let build = require('gulp-core-build');
let lint = require('gulp-core-build-typescript').tslint;
let typescript = require('gulp-core-build-typescript').typescript;
let sass = require('gulp-core-build-sass').default;
let karma = require('gulp-core-build-karma').default;
let webpack = require('gulp-core-build-webpack').default;
let serve = require('gulp-core-build-serve').default;

// Define gulp tasks.
let buildTasks = build.task('build', build.parallel(lint, typescript, sass));
let testTasks = build.task('test', build.serial(buildTasks, karma));
let bundleTasks = build.task('bundle', build.serial(buildTasks, webpack));
let serveTasks = build.task('serve', build.serial(bundleTasks, serve));
let defaultTasks = build.task('default', testTasks);

// Initialize!
build.initialize(require('gulp'));
```

# Usage

Within your project, install gulp, gulp-core-build, and the tasks you need:

```
npm install --save-dev gulp gulp-core-build
```

Then install the tasks you need:

```
npm install --save-dev gulp-core-build-typescript gulp-core-build-karma gulp-core-build-webpack gulp-core-build-serve

```

Create a gulpfile.js that sets up the tasks in the way you want them to run:

```javascript
'use strict';

// Import core build.
let build = require('gulp-core-build');

// Import the tasks.
let lint = require('gulp-core-build-typescript').tslint;
let typescript = require('gulp-core-build-typescript').typescript;
let sass = require('gulp-core-build-sass').default;
let karma = require('gulp-core-build-karma').default;
let webpack = require('gulp-core-build-webpack').default;
let serve = require('gulp-core-build-serve').default;

// Shorthand for defining custom subtasks
// The proper method for this is to introduce a new package which exports a class that extends GulpTask
// However, this shorthand allows an easy way to introduce one-off subtasks directly in the gulpfile
let helloWorldSubtask = build.subTask('do-hello-world-subtask', function(gulp, buildOptions, done) {
  this.log('Hello, World!'); // use functions from GulpTask
});

// Define gulp tasks.
let buildTasks = build.task('build', build.parallel(helloWorldSubtask, lint, typescript, sass));
let testTasks = build.task('test', build.serial(buildTasks, karma));
let bundleTasks = build.task('bundle', build.serial(buildTasks, webpack));
let serveTasks = build.task('serve', build.serial(bundleTasks, serve));
let helloWorldTasks = build.task('hello-world', helloWorldSubtask);
let defaultTasks = build.task('default', testTasks);

// Tell the build to set up gulp tasks with the given gulp instance.
build.initialize(require('gulp'));
```

Once this is set up, you should be able to execute the gulp tasks and they should run in the order you defined.

# Available tasks

| Task name | Description |
| --------- | ----------- |
| [gulp-core-build-typescript](https://www.npmjs.com/package/@microsoft/gulp-core-build-typescript) | Builds and lints typescript. |
| [gulp-core-build-sass](https://www.npmjs.com/package/@microsoft/gulp-core-build) | Compiles sass into css, into js modules, that are theme friendly. |
| [gulp-core-build-webpack](https://www.npmjs.com/package/@microsoft/gulp-core-build-webpack) | Runs webpack given a config, and outputs libraries plus the stats and logging. |
| [gulp-core-build-serve](https://www.npmjs.com/package/@microsoft/gulp-core-build-serve) | Sets up a server and live reload for a quick dev loop. |
| [gulp-core-build-karma](https://www.npmjs.com/package/@microsoft/gulp-core-build-karma) | Runs unit tests in a browser using [Karma](https://www.npmjs.com/package/karma) |
| [gulp-core-build-mocha](https://www.npmjs.com/package/@microsoft/gulp-core-build-mocha) | Runs unit tests in a NodeJS environment with [Mocha](https://www.npmjs.com/package/mocha) |
| [sp-build-core-tasks](https://www.npmjs.com/package/@microsoft/sp-build-core-tasks) | Special tasks for developing with the SharePoint Framework (SPFx) |

# API

## task(name, task)

Defines a named task to be registered with gulp as a primary gulp task, which will run the provided task when execution.

## parallel(tasks)

Runs a given list of tasks in parallel execution order.

## serial(tasks)

Runs a given list of tasks in serial execution order.

## subtask(name: string, fn: ICustomGulpTask)

Creates a subtask (which is not registered directly with gulp, use `task()` for that) which can be
used with `parallel()` and `serial()`. The `this` variable in the callback function will be an instance of a `GulpTask`.

`fn` should be a function of type `ICustomGulpTask`

```typescript
/**
 * The callback interface for a custom task definition.
 * The task should either return a Promise, a stream, or call the
 * callback function (passing in an object value if there was an error).
 */
export interface ICustomGulpTask {
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done: (failure?: Object) => void):
    Promise<Object> | NodeJS.ReadWriteStream | void;
}
```

## initialize(gulpInstance, [buildOtions])

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
    clean: { /* clean options */ }
  });
```

## addSuppression(suppression: string | RegExp)

Suppresses a warning or an error message. It will no longer be displayed in the build logs, nor will the warning or error cause the build to fail.

```typescript
// Suppresses this exact warning
build.addSuppression("Warning - tslint /foo/bar/test.tsx no-any")

// Suppresses anything with "tslint"
build.addSuppression(/tslint/)
```

# Building gulp-core-build
1. ```npm install --force```
2. ```gulp```

# Defining a custom task

The `subtask()` function is used to define a custom task. For example,
you could create the following subtask, which is registered to the command
`gulp hello-world`:

```javascript
let helloWorldSubtask = build.subTask('do-hello-world-subtask', function(gulp, buildOptions, done) {
  this.log('Hello, World!'); // use functions from GulpTask
});

// Register the task with gulp command line
let helloWorldTask = build.task('hello-world', helloWorldSubtask);
```

Note that the command `gulp do-hello-world-subtask` would error.


# License

MIT
