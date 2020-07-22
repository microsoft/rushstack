'use strict';

let build = require('@microsoft/node-library-build');

// This project doesn't have unit tests and GCB's Mocha doesn't play nice with Node 14, so disable Mocha
build.mocha.enabled = false;
build.instrument.enabled = false;

build.initialize(require('gulp'));
