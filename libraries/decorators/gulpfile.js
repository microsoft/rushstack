'use strict';

let path = require('path');
let build = require('@microsoft/web-library-build');

build.webpack.setConfig({ configPath: null });

build.initialize(require('gulp'));
