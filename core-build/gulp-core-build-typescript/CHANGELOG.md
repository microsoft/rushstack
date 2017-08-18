# Change Log - @microsoft/gulp-core-build-typescript

This log was last generated on Wed, 16 Aug 2017 23:16:55 GMT and should not be manually modified.

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

