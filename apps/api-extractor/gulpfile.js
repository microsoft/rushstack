'use strict';

const build = require('@microsoft/node-library-build');

build.jest.enabled = false;
build.mocha.enabled = false;

build.initialize(require('gulp'));
