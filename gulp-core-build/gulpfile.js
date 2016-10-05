'use strict';


var build = require('@microsoft/node-library-build');

build.setConfig({
  distFolder: 'package/dist',
  libFolder: 'package/lib',
        //libAMDFolder: 'package/lib-amd',
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

build.initialize(require('gulp'));