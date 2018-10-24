'use strict';

const build = require('@microsoft/node-library-build');

// Override to TypeScript 3 to allow use of symbol properties.
build.tscCmd.mergeConfig({
  overridePackagePath: require.resolve('typescript')
});

build.initialize(require('gulp'));
