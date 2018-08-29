'use strict';

let build = require('@microsoft/gulp-core-build');
let apiExtractorStandalone = require('@microsoft/gulp-core-build-typescript').apiExtractorStandalone;
let tsc = require('@microsoft/gulp-core-build-typescript').tscCmd;
let mocha = require('@microsoft/gulp-core-build-mocha');

build.setConfig({
  shouldWarningsFailBuild: build.getConfig().production
});

build.task('default', build.serial(tsc, apiExtractorStandalone));

build.initialize(require('gulp'));

