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

build.tslint.setConfig({
  lintConfig: require('./tslint.json')
});

build.initialize(require('gulp'));