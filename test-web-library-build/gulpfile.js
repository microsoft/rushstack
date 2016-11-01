'use strict';

let build = require('@microsoft/web-library-build');

build.sass.setConfig({ useCSSModules: true });
build.webpack.setConfig({ configPath: null });
build.karma.setConfig({ configPath: null });

build.initialize(require('gulp'));

