# Change Log - @microsoft/gulp-core-build-typescript

This log was last generated on Fri, 27 Jan 2017 20:04:15 GMT and should not be manually modified.

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

