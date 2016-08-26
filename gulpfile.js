'use strict';

const tslint = require('tslint');
const build = require('@microsoft/node-library-build');
build.tslint.setConfig({
  lintConfig: require('./src/defaultTslint.json'),
  rulesDirectory: tslint.getRulesDirectories(tslint.getRulesDirectories([ './node_modules/tslint-microsoft-contrib' ], __dirname))
});

build.typescript.setConfig({
  sourceMatch: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'typings/main/**/*.ts',
    'typings/main.d.ts'
  ]
});

build.initialize(require('gulp'));