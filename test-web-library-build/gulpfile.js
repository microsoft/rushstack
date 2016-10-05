'use strict';

let build = require('@microsoft/web-library-build');

build.setConfig({
  distFolder: 'package/dist',
  libFolder: 'package/lib',
  libAMDFolder: 'package/lib-amd',
  //libES6Folder: 'package/lib-es6'
});

build.typescript.setConfig({
  typescript: require('typescript'),
  sourceMatch: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'typings/main/**/*.ts',
    'typings/main.d.ts'
  ],
  staticMatch: ['src/**/*.png']
});

build.webpack.setConfig({ configPath: null });

build.karma.setConfig({ karmaConfigPath: null });

let rollup = require('rollup').rollup;
let { task, subTask, serial, parallel } = build;

let rollupTask = subTask('rollup', (gulp, buildConfig, done) => {
  return rollup(require('./rollup.config')).then(bundle => {
    console.log(bundle.generate({
      format: 'amd'
    }).code);
    done();
  });
});

task('default', serial(build.preCopy, build.sass, parallel(build.tslint, build.typescript, build.text), rollupTask, build.postCopy));

build.initialize(require('gulp'));