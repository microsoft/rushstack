'use strict';

let build = require('gulp-core-build');

build.initializeTasks(
  require('gulp'),
  {
    build: {
      paths: {
        lessMatch: null,
        sassMatch: null,
        htmlMatch: null,
        amdLibFolder: 'lib-amd',
        staticsMatch: [ 'src/**/*.js']
      }
    }
  }
);
