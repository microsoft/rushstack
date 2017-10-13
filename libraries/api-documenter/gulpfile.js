'use strict';

const build = require('@microsoft/node-library-build');

build.mocha.enabled = false;

const jestTask = new build.JestTask();
build.task('default', build.serial(build.defaultTasks, jestTask));
build.task('test', build.serial(build.testTasks, jestTask));

build.initialize(require('gulp'));
