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

build.task('default', build.serial(build.defaultTasks, build.subTask('run-api-extractor', () => {
  const externalApiHelper = require('@microsoft/api-extractor').ExternalApiHelper;
  const files = ['external-api-types/es6-collections/index.d.ts',
                 'external-api-types/es6-promise/index.d.ts',
                 'external-api-types/whatwg-fetch/index.d.ts'];

  for (const filePath of files) {
    /* todo: fix these parameters: ... */
    externalApiHelper.generateApiJson(this.buildConfig.rootPath, entryPointFile, outputApiJsonFilePath);
  }
})));

build.initialize(require('gulp'));
