'use strict';

const build = require('@microsoft/node-library-build');

build.typescript.taskConfig.typescript = require('typescript');

build.initialize(require('gulp'));
