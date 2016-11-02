'use strict';

let build = require('@microsoft/gulp-core-build');
let typescript = require('@microsoft/gulp-core-build-typescript').typescript;

typescript.setConfig({ typescript: require('typescript') });

build.task('default', typescript);

build.initialize(require('gulp'));

