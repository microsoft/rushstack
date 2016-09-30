'use strict';

var build = require('@microsoft/node-library-build');

build.typescript.setConfig({
  sourceMatch: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'typings/main/**/*.ts',
    'typings/main.d.ts'
  ],
  staticMatch: [ 'src/**/*.png' ]
});

build.initialize(require('gulp'));