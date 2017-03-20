# Change Log - @microsoft/gulp-core-build

This log was last generated on Mon, 20 Mar 2017 21:52:20 GMT and should not be manually modified.

## 2.4.3
Mon, 20 Mar 2017 21:52:20 GMT

*Changes not tracked*

## 2.4.2
Sat, 18 Mar 2017 01:31:49 GMT

### Patches

- Fixes an issue with the clean command, which causes builds to spuriously fail.

## 2.4.1
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 2.4.0
Sat, 18 Feb 2017 02:32:06 GMT

### Minor changes

- Add an enabled toggle to IExecutable and GulpTask. Using this toggle is now preferred to overriding the isEnabled function.

## 2.3.1
Thu, 09 Feb 2017 02:35:45 GMT

### Patches

- Don't watch process exit if user passed in the -h flag.

## 2.3.0
Wed, 08 Feb 2017 01:41:58 GMT

### Minor changes

- Remove a function which was exposing z-schema and causing issues.

## 2.2.3
Wed, 08 Feb 2017 01:05:47 GMT

### Patches

- Ensure the log function is exported

## 2.2.2
Wed, 08 Feb 2017 00:23:01 GMT

### Patches

- Fix _flatten and make serial/parallel more robust

## 2.2.1
Tue, 07 Feb 2017 02:33:34 GMT

### Patches

- Update node-notifier to remove SNYK warning about marked package having a vulnerability (although this vulnerability should not affect us)

## 2.2.0
Mon, 23 Jan 2017 20:07:59 GMT

### Minor changes

- Remove several logging utilities from the public API and improve documentation in other places.

## 2.1.1
Fri, 20 Jan 2017 01:46:41 GMT

### Patches

- Update documentation.

## 2.1.0
Wed, 18 Jan 2017 21:40:58 GMT

### Minor changes

- Export the SchemaValidator

## 2.0.1
Fri, 13 Jan 2017 06:46:05 GMT

### Patches

- Enable the schema for CopyTask.

