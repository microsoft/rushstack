'use strict';

let build = require('@microsoft/node-library-build');

build.setConfig({
  libAMDFolder: 'lib-amd'
});

build.initialize(require('gulp'));
