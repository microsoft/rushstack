'use strict';

const build = require('@microsoft/node-library-build');
const path = require('path');

const sharedDir = path.join(__dirname, 'src', 'shared');
build.preCopy.setConfig({
  copyTo: {
    [sharedDir]: [
      path.join(__dirname, 'node_modules', '@microsoft', 'rush-stack-compiler-shared', 'src', 'shared', '**', '*')
    ]
  }
});

build.preCopy.cleanMatch = [sharedDir];

build.initialize(require('gulp'));
