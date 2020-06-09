'use strict';

let build = require('@microsoft/gulp-core-build');
let { tscCmd, lintCmd, apiExtractor } = require('@microsoft/gulp-core-build-typescript');

build.setConfig({
  shouldWarningsFailBuild: build.getConfig().production
});

build.task('default', build.serial(build.parallel(tscCmd, lintCmd), apiExtractor));

build.initialize(require('gulp'));
