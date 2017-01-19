'use strict';

const tslint = require('tslint');
const build = require('@microsoft/node-library-build');
const path = require('path');

build.tslint.setConfig({
  lintConfig: require('./src/defaultTslint.json'),
  rulesDirectory: tslint.Configuration.getRulesDirectories(tslint.Configuration.getRulesDirectories([ './node_modules/tslint-microsoft-contrib' ], __dirname))
});

build.typescript.setConfig({
  typescript: require('typescript')
});

build.task('default', build.serial(build.defaultTasks, build.subTask('runApiExtractor', (gulp, buildConfig, done) => {
  const apiExtractor = require('@microsoft/api-extractor');

  const files = ['external-api-types/es6-collections/index.d.ts',
                 'external-api-types/es6-collections/index.d.ts',
                 'external-api-types/es6-promise/index.d.ts'];

  files.forEach((filePath) => {
    const rootDir = path.dirname(filePath);
    const outputApiJsonFilePath = path.join(buildConfig.distFolder,
                                            'external-api-json',
                                            `${path.basename(rootDir)}.json`);
    const entryPointFile = path.join(buildConfig.rootDir, filePath);
    apiExtractor.ExternalApiHelper.generateApiJson(rootDir, entryPointFile, outputApiJsonFilePath);
  });
})));

build.initialize(require('gulp'));
