'use strict';

const tslint = require('tslint');
const build = require('@microsoft/node-library-build');

build.tslint.setConfig({
  lintConfig: require('./src/defaultTslint.json'),
  rulesDirectory: tslint.Configuration.getRulesDirectories(tslint.Configuration.getRulesDirectories([ './node_modules/tslint-microsoft-contrib' ], __dirname))
});

build.typescript.setConfig({
  typescript: require('typescript')
});

build.initialize(require('gulp'));