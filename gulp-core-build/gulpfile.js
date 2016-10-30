'use strict';

var build = require('@microsoft/node-library-build');

build.typescript.setConfig({
  typescript: require('typescript')
});

build.initialize(require('gulp'));