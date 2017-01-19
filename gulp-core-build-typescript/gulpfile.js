'use strict';

const tslint = require('tslint');
const build = require('@microsoft/node-library-build');
const path = require('path');
const fs = require('fs');

build.tslint.setConfig({
  lintConfig: require('./src/defaultTslint.json'),
  rulesDirectory: tslint.Configuration.getRulesDirectories(tslint.Configuration.getRulesDirectories([ './node_modules/tslint-microsoft-contrib' ], __dirname))
});

build.typescript.setConfig({
  typescript: require('typescript')
});

// We need to wrap this class in a getter because it hasn't been compiled by the time this file is executed
const taskWrapper = {};
Object.defineProperty(taskWrapper, "default", {
  get: () => require('./lib/RunApiExtractorOnExternalApiTypes.js').default
});

build.task('default', build.serial(build.defaultTasks, taskWrapper));

build.initialize(require('gulp'));
