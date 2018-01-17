'use strict';

let build = require('@microsoft/node-library-build');

// Temporarily fix rules that aren't compatible with the old version of TSLint
build.tslint.setConfig({
  lintConfig: {
    rules: {
      'no-duplicate-case': false,
      'valid-typeof': false
    }
  }
});

build.initialize(require('gulp'));
