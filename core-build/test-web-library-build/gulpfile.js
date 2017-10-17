'use strict';

let path = require('path');
let build = require('@microsoft/web-library-build');

build.sass.setConfig({ useCSSModules: true });
build.webpack.setConfig({ configPath: null });

build.setConfig({
  libAMDFolder: path.join(build.getConfig().packageFolder, 'lib-amd'),
  libES6Folder: path.join(build.getConfig().packageFolder, 'lib-es6')
});

build.preCopy.cleanMatch = ['src/preCopyTest.ts'];

build.karma.enabled = false;

const jestTask = new build.JestTask();
build.task('default', build.serial(build.defaultTasks, jestTask));
build.task('test', build.serial(build.testTasks, jestTask));

build.initialize(require('gulp'));
