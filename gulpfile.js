'use strict';

var build = require('node-library-build');

build.typescript.setConfig({
  sourceMatch: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'typings/main/**/*.ts',
    'typings/main.d.ts'
  ]
});

build.initialize(require('gulp'));