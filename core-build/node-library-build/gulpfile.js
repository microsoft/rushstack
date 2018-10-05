'use strict';

let build = require('@microsoft/gulp-core-build');
let apiExtractor = require('@microsoft/gulp-core-build-typescript').apiExtractor;
let tsc = require('@microsoft/gulp-core-build-typescript').tscCmd;
let mocha = require('@microsoft/gulp-core-build-mocha');

build.setConfig({
  shouldWarningsFailBuild: build.getConfig().production
});

build.task('default', build.serial(tsc, apiExtractor, mocha));

build.initialize(require('gulp'));

