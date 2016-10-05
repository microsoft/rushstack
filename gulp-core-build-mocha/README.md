# gulp-core-build-mocha

`gulp-core-build-mocha` is a `gulp-core-build` subtask for running unit tests and creating coverage reports using mocha/chai.
This setup is useful for unit testing build tools, as it runs in the node process rather than in a browser.

[![npm version](https://badge.fury.io/js/%40microsoft%2Fgulp-core-build-mocha.svg)](https://badge.fury.io/js/gulp-core-build-mocha)
[![Build Status](https://travis-ci.org/Microsoft/gulp-core-build-mocha.svg?branch=master)](https://travis-ci.org/Microsoft/gulp-core-build-mocha) [![Dependencies](https://david-dm.org/Microsoft/gulp-core-build-mocha.svg)](https://david-dm.org/Microsoft/gulp-core-build-mocha)

# Description

**gulp-core-build-mocha** is a gulp-core-build plugin which will automatically execute a set of
unit test files using the mocha test suite.

# MochaTask
## Usage

Simply create a file which ends in `.test.js`. Next, register the Mocha task to gulp-core-build.

A coverage report is both written to the console and to a folder on disk.

## Configuration

### testMatch

Sets the glob pattern which is used to locate the files to run tests on.

**Default:** 'lib/\*\*/\*.test.js'

### reportDir

The folder in which to store the coverage reports.

**Default:** 'coverage'

# InstrumentTask
## Usage

This task selects which files should be covered by the code coverage tool.

## Configuration
### coverageMatch
An array of globs which define which files should be included in code coverage reports.

**Default:** `['lib/**/*.js', '!lib/**/*.test.js']`

# License

MIT