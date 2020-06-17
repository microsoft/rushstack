'use strict';

const build = require('@microsoft/node-library-build');

build.jest.setConfig({ coverageReporters: ['json'] }); // Temporary - until the Handlebars issue is fixed

build.initialize(require('gulp'));
