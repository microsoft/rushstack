'use strict';

const build = require('@microsoft/node-library-build');
const path = require('path');

const sharedSrcDir = path.join(__dirname, 'src', 'shared');
const sharedLibDir = path.join(__dirname, 'lib', 'shared');
build.preCopy.setConfig({
  copyTo: {
    [sharedSrcDir]: [
      path.join(
        __dirname,
        'node_modules',
        '@microsoft',
        'rush-stack-compiler-shared',
        'src',
        'shared',
        '**',
        '*'
      ),
    ],
    [sharedLibDir]: [
      path.join(
        __dirname,
        'node_modules',
        '@microsoft',
        'rush-stack-compiler-shared',
        'src',
        'shared',
        '**',
        '*.d.ts'
      ),
    ],
  },
  shouldFlatten: false,
});

build.preCopy.cleanMatch = [sharedSrcDir];

// This project doesn't have unit tests and GCB's Mocha doesn't play nice with Node 14, so disable Mocha
build.mocha.enabled = false;
build.instrument.enabled = false;

build.initialize(require('gulp'));
