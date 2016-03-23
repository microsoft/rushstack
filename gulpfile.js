'use strict';

let build = require('gulp-core-build');
let typescript = require('gulp-core-build-typescript');
let mocha = require('gulp-core-build-mocha');

build.task('default', build.serial(typescript, mocha));

build.initialize(require('gulp'));

