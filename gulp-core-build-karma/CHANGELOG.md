# Change Log - @microsoft/gulp-core-build-karma

This log was last generated on Wed, 19 Apr 2017 20:18:06 GMT and should not be manually modified.

## 2.2.2
Wed, 19 Apr 2017 20:18:06 GMT

### Patches

- Remove ES6 Promise & @types/es6-promise typings

## 2.2.1
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 2.2.0
Fri, 24 Feb 2017 14:01:38 GMT

### Minor changes

- The KarmaTask should only cause the build to fail if we are in production, otherwise treat failing tests as a warning.

## 2.1.3
Wed, 01 Feb 2017 02:32:46 GMT

### Patches

- Fixes a bug where the tests.js would not be written if the temp folder did not exist.

## 2.1.2
Tue, 31 Jan 2017 01:55:09 GMT

### Patches

- Introduce schema for KarmaTask

## 2.1.1
Mon, 30 Jan 2017 20:03:56 GMT

### Patches

- Making the "testMatch" property of "IKarmaTaskConfig" optional.

## 2.1.0
Fri, 27 Jan 2017 23:27:42 GMT

### Minor changes

- Add an additional configuration option (testMatch) to the KarmaTask configuration. If this option is specified, the KarmaTask will create a tests.js file in the temp folder which uses the testMatch regular expression to  locate test files.

## 2.0.2
Fri, 20 Jan 2017 01:46:41 GMT

### Patches

- Upgrading webpack-karma to support webpack 2.X

## 2.0.1
Fri, 13 Jan 2017 06:46:05 GMT

*Initial release*

