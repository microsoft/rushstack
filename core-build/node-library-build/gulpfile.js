'use strict';

let build = require('@microsoft/gulp-core-build');
let { tscCmd, lintCmd, apiExtractor } = require('@microsoft/gulp-core-build-typescript')
let mocha = require('@microsoft/gulp-core-build-mocha');

build.setConfig({
  shouldWarningsFailBuild: build.getConfig().production
});

build.task('default', build.serial(build.parallel(tscCmd, lintCmd), apiExtractor, mocha));

build.initialize(require('gulp'));

