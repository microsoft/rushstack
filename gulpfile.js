'use strict';

let build = require('node-library-build');

build.setConfig({
  libAMDFolder: 'lib-amd'
});

build.initialize(require('gulp'));
