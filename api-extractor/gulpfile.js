'use strict';

const build = require('@microsoft/node-library-build');

const tslintCommon = require('@microsoft/sp-tslint-rules');
tslintCommon.initializeTslintTask(build.tslint);

build.initialize(require('gulp'));
