# Change Log - @microsoft/web-library-build

This log was last generated on Tue, 08 Aug 2017 23:10:36 GMT and should not be manually modified.

## 3.2.4
Tue, 08 Aug 2017 23:10:36 GMT

*Changes not tracked*

## 3.2.3
Sat, 05 Aug 2017 01:04:41 GMT

*Changes not tracked*

## 3.2.2
Mon, 31 Jul 2017 21:18:26 GMT

*Changes not tracked*

## 3.2.1
Thu, 27 Jul 2017 01:04:48 GMT

### Patches

- Upgrade to the TS2.4 version of the build tools and restrict the dependency version requirements.
- Fix an issue with 'gulp serve' where the server was not being launched.

## 3.2.0
Tue, 25 Jul 2017 20:03:31 GMT

### Minor changes

- Upgrade to TypeScript 2.4

## 3.1.0
Fri, 07 Jul 2017 01:02:28 GMT

### Minor changes

- Enable StrictNullChecks.

## 3.0.3
Thu, 29 Jun 2017 01:05:37 GMT

### Patches

- Fix an issue with 'gulp serve' where an initial build error would stop  watch from continuing

## 3.0.2
Tue, 16 May 2017 00:01:03 GMT

### Patches

- Remove unnecessary fsevents optional dependency

## 3.0.1
Wed, 19 Apr 2017 20:18:06 GMT

### Patches

- Remove ES6 Promise & @types/es6-promise typings

## 3.0.0
Mon, 20 Mar 2017 21:52:20 GMT

### Breaking changes

- Updating build task dependencies.

## 2.3.2
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 2.3.1
Fri, 03 Mar 2017 02:31:24 GMT

### Patches

- Restore TS Lint task in gulp build

## 2.3.0
Wed, 08 Feb 2017 01:41:58 GMT

### Minor changes

- Treat warnings as errors in production. Treat tslint errors as warnings.

## 2.2.2
Tue, 07 Feb 2017 02:33:34 GMT

### Patches

- Remove unused dependency

## 2.2.1
Fri, 27 Jan 2017 23:27:42 GMT

### Patches

- Refactor the build task to not run "text" subtask twice.

## 2.2.0
Fri, 20 Jan 2017 01:46:41 GMT

### Minor changes

- Run the api-extractor task during the default build.

## 2.1.0
Fri, 13 Jan 2017 06:46:05 GMT

### Minor changes

- Enable the ApiExtractor task from gulp-core-build-typescript.

## 2.0.0
Wed, 11 Jan 2017 14:11:26 GMT

*Initial release*

