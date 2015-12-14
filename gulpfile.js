'use strict';

let build = require('./lib/index');

// Use the build tools to build the build tools.
build.initializeTasks(
  require('gulp'),
  {
    build: {
      paths: {
        lessMatch: null,
        staticsMatch: null,
        htmlMatch: null
      },
      isLintingEnabled: true
    }
  });

