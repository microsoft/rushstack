'use strict';

let path = require('path');
let build = require('@microsoft/web-library-build');

build.sass.setConfig({ useCSSModules: true });
build.webpack.setConfig({ configPath: null });
build.karma.setConfig({ configPath: null });

build.setConfig({
  libAMDFolder: path.join(build.getConfig().packageFolder, 'lib-amd')
});

build.preCopy.cleanMatch = ['src/pre-copy-test.ts'];

build.initialize(require('gulp'));
