# @microsoft/gulp-core-build-karma

`gulp-core-build-karma` is a `gulp-core-build` subtask for running unit tests using karma/phantomjs/mocha/chai. This setup allows you to run browser based testing.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-karma.svg)](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-karma)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-karma.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-karma) [![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-karma.svg)](https://david-dm.org/Microsoft/gulp-core-build-karma)

# Description

**gulp-core-build-karma** is a gulp-core-build plugin which uses KarmaJS to configure a browser
to run a bundle of code, primarily unit tests using mocha.

# KarmaTask
## Usage

Simply register the task in a gulp-core-build tree, and it will automatically look for a **karma.config.js** file.
The default karma config, which can be obtained by running the task with the `--initkarma` flag,
always looks for a file called `src/tests.js` and uses this as the entry point for the bundle which will
be tested.

The task will launch the PhantomJS browser and begin automatically running mocha tests.

Once testing is complete, a coverage report is written to the `coverage` folder.

A number of plugins for karma are automatically configured, including:
* karma-webpack
* karma-mocha
* karma-coverage
* karma-phantomjs-launcher
* karma-sinon-chai

## Configuration

### karmaConfigPath

Sets the path to the Karma Configuration file to use. If one has not been created, this task
will prompt the user to run it again with the `--initkarma` flag.

**Default:** './karma.config.json'

# License

MIT