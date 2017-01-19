'use strict';

let build = require('@microsoft/gulp-core-build');
let apiExtractor = require('@microsoft/gulp-core-build-typescript').apiExtractor;
let typescript = require('@microsoft/gulp-core-build-typescript').typescript;
let mocha = require('@microsoft/gulp-core-build-mocha');

typescript.setConfig({ typescript: require('typescript') });

build.task('default', build.serial(typescript, mocha, apiExtractor));

build.initialize(require('gulp'));

