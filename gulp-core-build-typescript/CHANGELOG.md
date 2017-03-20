# Change Log - @microsoft/gulp-core-build-typescript

This log was last generated on Mon, 20 Mar 2017 04:20:13 GMT and should not be manually modified.

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

