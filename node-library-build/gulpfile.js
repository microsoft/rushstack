'use strict';

let build = require('@microsoft/gulp-core-build');
let { typescript } = require('@microsoft/gulp-core-build-typescript');
let mocha = require('@microsoft/gulp-core-build-mocha');

typescript.setConfig({ typescript: require('typescript') });

build.task('default', build.serial(typescript, mocha));

build.initialize(require('gulp'));

