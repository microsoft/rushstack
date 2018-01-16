'use strict';

let build = require('@microsoft/node-library-build');

// Temporarily fix rules that aren't compatible with the old version of TSLint
build.tslint.setConfig({
  lintConfig: {
    rules: {
      'no-duplicate-case': false,
      'valid-typeof': false,
      'typeof-compare': true
    }
  }
});

build.initialize(require('gulp'));
