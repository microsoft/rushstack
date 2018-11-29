'use strict';

const build = require('@microsoft/node-library-build');

// Remove these when node-library-build is published and bumped
build.tscCmd.mergeConfig({
  allowBuiltinCompiler: true
});

build.tslintCmd.mergeConfig({
  allowBuiltinCompiler: true
});

build.apiExtractor.mergeConfig({
  allowBuiltinCompiler: true
});

build.mocha.enabled = false;
build.initialize(require('gulp'));
