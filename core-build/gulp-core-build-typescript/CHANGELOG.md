# Change Log - @microsoft/gulp-core-build-typescript

This log was last generated on Mon, 13 Nov 2017 17:04:50 GMT and should not be manually modified.

## 4.2.14
Mon, 13 Nov 2017 17:04:50 GMT

*Version update only*

## 4.2.13
Mon, 06 Nov 2017 17:04:18 GMT

*Version update only*

## 4.2.12
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 4.2.11
Wed, 01 Nov 2017 21:06:08 GMT

### Patches

- Upgrade cyclic dependencies

## 4.2.10
Tue, 31 Oct 2017 21:04:04 GMT

*Version update only*

## 4.2.9
Tue, 31 Oct 2017 16:04:55 GMT

*Version update only*

## 4.2.8
Wed, 25 Oct 2017 20:03:59 GMT

*Version update only*

## 4.2.7
Tue, 24 Oct 2017 18:17:12 GMT

*Version update only*

## 4.2.6
Mon, 23 Oct 2017 21:53:12 GMT

### Patches

- Updated cyclic dependencies

## 4.2.5
Fri, 20 Oct 2017 19:57:12 GMT

*Version update only*

## 4.2.4
Fri, 20 Oct 2017 01:52:54 GMT

*Version update only*

## 4.2.3
Fri, 20 Oct 2017 01:04:44 GMT

### Patches

- Updated to use simplified api-extractor interface

## 4.2.2
Thu, 05 Oct 2017 01:05:02 GMT

### Patches

- Fix an error message when the "module" property is set to esnext.

## 4.2.1
Thu, 28 Sep 2017 01:04:28 GMT

*Version update only*

## 4.2.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 4.1.0
Wed, 20 Sep 2017 22:10:17 GMT

### Minor changes

- Support ESNext module output format and allow a base TypeScript configuration to be set by a build rig.

## 4.0.7
Mon, 11 Sep 2017 13:04:55 GMT

*Version update only*

## 4.0.6
Fri, 08 Sep 2017 01:28:04 GMT

### Patches

- Deprecate @types/es6-coll ections in favor of built-in typescript typings 'es2015.collection' a nd 'es2015.iterable'

## 4.0.5
Thu, 07 Sep 2017 13:04:35 GMT

*Version update only*

## 4.0.4
Thu, 07 Sep 2017 00:11:11 GMT

### Patches

-  Add $schema field to all schemas

## 4.0.3
Wed, 06 Sep 2017 13:03:42 GMT

*Version update only*

## 4.0.2
Tue, 05 Sep 2017 19:03:56 GMT

*Version update only*

## 4.0.1
Sat, 02 Sep 2017 01:04:26 GMT

*Version update only*

## 4.0.0
Thu, 31 Aug 2017 18:41:18 GMT

### Breaking changes

- Fix compatibility issues with old releases, by incrementing the major version number

## 3.5.3
Thu, 31 Aug 2017 17:46:25 GMT

*Version update only*

## 3.5.2
Wed, 30 Aug 2017 01:04:34 GMT

*Version update only*

## 3.5.1
Thu, 24 Aug 2017 22:44:12 GMT

*Version update only*

## 3.5.0
Thu, 24 Aug 2017 01:04:33 GMT

### Minor changes

- Upgrade to tslint 5.6.0

## 3.4.2
Tue, 22 Aug 2017 13:04:22 GMT

*Version update only*

## 3.4.1
Wed, 16 Aug 2017 23:16:55 GMT

### Patches

- Publish

## 3.4.0
Wed, 16 Aug 2017 13:04:08 GMT

### Minor changes

- Include the no-unused-variable TSLint rule to bring back the "no-unused-import" functionality. Remove no-unused-parameters default TSConfig option to be consistent with the TSLint no-unused-variable behavior.

## 3.3.2
Tue, 15 Aug 2017 01:29:31 GMT

### Patches

- Force a patch bump to ensure everything is published

## 3.3.1
Thu, 27 Jul 2017 01:04:48 GMT

### Patches

- Upgrade to the TS2.4 version of the build tools.

## 3.3.0
Tue, 25 Jul 2017 20:03:31 GMT

### Minor changes

- Upgrade to TypeScript 2.4

## 3.2.0
Fri, 07 Jul 2017 01:02:28 GMT

### Minor changes

- Enable StrictNullChecks.

## 3.1.5
Wed, 21 Jun 2017 04:19:35 GMT

### Patches

- Add missing API Extractor release tags

## 3.1.3
Fri, 16 Jun 2017 01:21:40 GMT

### Patches

- Upgraded api-extractor dependency

## 3.1.2
Fri, 16 Jun 2017 01:04:08 GMT

### Patches

- Fix issue where TypeScriptTask did not allow you to set a target other than "commonjs"

## 3.1.1
Fri, 28 Apr 2017 01:03:54 GMT

### Patches

- Bugfix: Update TypeScriptConfiguration to allow setting a custom version of typescript compiler.

## 3.1.0
Mon, 24 Apr 2017 22:01:17 GMT

### Minor changes

- Adding `libES6Dir` setting to taskConfig to optionally output es6 modules.

## 3.0.4
Wed, 19 Apr 2017 20:18:06 GMT

### Patches

- Remove ES6 Promise & @types/es6-promise typings

## 3.0.3
Tue, 18 Apr 2017 23:41:42 GMT

### Patches

- API Extractor now uses Gulp-Typescript to generate compiler options.

## 3.0.2
Fri, 07 Apr 2017 21:43:16 GMT

### Patches

- Adjusted the version specifier for typescript to ~2.2.2

## 3.0.1
Wed, 05 Apr 2017 13:01:40 GMT

### Patches

- Fixing the way the TSLint task is configured to allow removal of existing rules.

## 3.0.0
Mon, 20 Mar 2017 21:52:20 GMT

### Breaking changes

- Updating typescript, gulp-typescript, and tslint.

## 2.4.1
Mon, 20 Mar 2017 04:20:13 GMT

### Patches

- Reverting change.

## 2.4.0
Sun, 19 Mar 2017 19:10:30 GMT

### Minor changes

- Updating typescript, gulp-typescript, and tslint.

## 2.3.0
Thu, 16 Mar 2017 19:02:22 GMT

### Minor changes

- Write the TSLint configuration file after executing the task.

## 2.2.6
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 2.2.5
Tue, 31 Jan 2017 20:32:37 GMT

### Patches

- Make loadSchema public instead of protected.

## 2.2.4
Tue, 31 Jan 2017 01:55:09 GMT

### Patches

- Introduce schema for TsLintTask, TypeScriptTask

## 2.2.3
Fri, 27 Jan 2017 20:04:15 GMT

### Patches

- Added external json docs loading before analyzing API

## 2.2.2
Fri, 27 Jan 2017 02:35:10 GMT

### Patches

- Added external-api-json folder with external types definitions. Added gulp task to run ApiExtractor on external types defintions.

## 2.2.1
Thu, 19 Jan 2017 02:37:34 GMT

### Patches

- Updating the tsconfig to give compiler options as enums.

## 2.2.0
Wed, 18 Jan 2017 21:40:58 GMT

### Minor changes

- Refactor the API-Extractor to use the same config as the TypeScriptTask

## 2.1.1
Fri, 13 Jan 2017 06:46:05 GMT

### Patches

- Add a schema for the api-extractor task and change the name.

## 2.1.0
Wed, 11 Jan 2017 14:11:26 GMT

### Minor changes

- Adding an API Extractor task.

## 2.0.1
Wed, 04 Jan 2017 03:02:12 GMT

### Patches

- Fixing TSLint task by removing some deprecated rules ("label-undefined”, "no-duplicate-key", and "no-unreachable") and setting the "noUnusedParameters" and "noUnusedLocals" TS compiler options to cover the deprecated "no-unused-variable".

