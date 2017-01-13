'use strict';

const build = require('@microsoft/sp-build-node');

const tslintCommon = require('@microsoft/sp-tslint-rules');
tslintCommon.initializeTslintTask(build.tslint);

build.initialize(require('gulp'));
