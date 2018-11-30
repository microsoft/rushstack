'use strict';

const build = require('@microsoft/node-library-build');
const path = require('path');

build.preCopy.setConfig({
  copyTo: {
    [path.join(__dirname, 'src', 'shared')]: [
      path.join(__dirname, 'node_modules', '@microsoft', 'rush-stack-compiler-shared', 'src', 'shared', '**', '*')
    ]
  }
})

build.initialize(require('gulp'));
