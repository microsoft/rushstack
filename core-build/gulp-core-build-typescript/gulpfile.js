'use strict';

const build = require('@microsoft/node-library-build');

build.task(
  'default',
  build.serial(
    build.defaultTasks,
    build.subTask(
      'run-api-extractor',
      (gulp, buildConfig, callback) => {
        const externalApiHelper = require('@microsoft/api-extractor').ExternalApiHelper;
        const files = ['resources/external-api-types/es6-collections/index.d.ts',
          'resources/external-api-types/web-apis/index.d.ts'];

        for (const filePath of files) {
          externalApiHelper.generateApiJson(buildConfig.rootPath, buildConfig.libFolder, filePath);
        }

        callback();
      }
    )
  )
);

// Temporarily fix rules that aren't compatible with the old version of TSLint
build.tslint.setConfig({
  lintConfig: {
    rules: {
      'no-duplicate-case': false,
      'valid-typeof': false
    }
  }
});

build.initialize(require('gulp'));
