'use strict';

let path = require('path');
let build = require('@microsoft/web-library-build');

build.sass.setConfiguration({ useCSSModules: true });
build.webpack.setConfiguration({ configurationPath: null });

build.setConfiguration({
  libAMDFolder: path.join(build.getConfiguration().packageFolder, 'lib-amd')
});

build.preCopy.cleanMatch = ['src/pre-copy-test.ts'];

build.initialize(require('gulp'));
