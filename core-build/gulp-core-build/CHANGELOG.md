# Change Log - @microsoft/gulp-core-build

This log was last generated on Mon, 13 Nov 2017 17:04:50 GMT and should not be manually modified.

## 3.2.7
Mon, 13 Nov 2017 17:04:50 GMT

### Patches

- Allow settings in jest.json to override Jest task's default options

## 3.2.6
Mon, 06 Nov 2017 17:04:18 GMT

### Patches

- Automatically use --colors unless --no-colors is specified.

## 3.2.5
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 3.2.4
Wed, 01 Nov 2017 21:06:08 GMT

### Patches

- Upgrade cyclic dependencies

## 3.2.3
Tue, 31 Oct 2017 21:04:04 GMT

*Version update only*

## 3.2.2
Tue, 31 Oct 2017 16:04:55 GMT

### Patches

- Fix an issue where an exception was being thrown when displaying toasts for build failures.

## 3.2.1
Wed, 25 Oct 2017 20:03:59 GMT

*Version update only*

## 3.2.0
Tue, 24 Oct 2017 18:17:12 GMT

### Minor changes

- Add a Jest task to support running tests on Jest

## 3.1.6
Mon, 23 Oct 2017 21:53:12 GMT

### Patches

- Updated cyclic dependencies

## 3.1.5
Fri, 20 Oct 2017 19:57:12 GMT

*Version update only*

## 3.1.4
Fri, 20 Oct 2017 01:52:54 GMT

*Version update only*

## 3.1.3
Fri, 20 Oct 2017 01:04:44 GMT

*Version update only*

## 3.1.2
Thu, 05 Oct 2017 01:05:02 GMT

*Version update only*

## 3.1.1
Thu, 28 Sep 2017 01:04:28 GMT

*Version update only*

## 3.1.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 3.0.8
Wed, 20 Sep 2017 22:10:17 GMT

*Version update only*

## 3.0.7
Mon, 11 Sep 2017 13:04:55 GMT

*Version update only*

## 3.0.6
Fri, 08 Sep 2017 01:28:04 GMT

*Version update only*

## 3.0.5
Thu, 07 Sep 2017 13:04:35 GMT

*Version update only*

## 3.0.4
Thu, 07 Sep 2017 00:11:12 GMT

### Patches

-  Add $schema field to all schemas

## 3.0.3
Wed, 06 Sep 2017 13:03:42 GMT

*Version update only*

## 3.0.2
Tue, 05 Sep 2017 19:03:56 GMT

*Version update only*

## 3.0.1
Sat, 02 Sep 2017 01:04:26 GMT

*Version update only*

## 3.0.0
Thu, 31 Aug 2017 18:41:18 GMT

### Breaking changes

- Fix compatibility issues with old releases, by incrementing the major version number

## 2.10.1
Thu, 31 Aug 2017 17:46:25 GMT

*Version update only*

## 2.10.0
Wed, 30 Aug 2017 01:04:34 GMT

### Minor changes

- added CopyStaticAssetsTask

## 2.9.6
Thu, 24 Aug 2017 22:44:12 GMT

### Patches

- Update the schema validator.

## 2.9.5
Thu, 24 Aug 2017 01:04:33 GMT

*Version update only*

## 2.9.4
Tue, 22 Aug 2017 13:04:22 GMT

*Version update only*

## 2.9.3
Tue, 15 Aug 2017 19:04:14 GMT

### Patches

- Allow a partial config to be passed to GulpTask.mergeConfig.

## 2.9.2
Tue, 15 Aug 2017 01:29:31 GMT

### Patches

- Force a patch bump to ensure everything is published

## 2.9.1
Sat, 12 Aug 2017 01:03:30 GMT

### Patches

- Add missing orchestrator dependency.

## 2.9.0
Fri, 11 Aug 2017 21:44:05 GMT

### Minor changes

- Refactor GulpTask to support taking the name and initial task configuration through the constructor.

## 2.8.0
Sat, 05 Aug 2017 01:04:41 GMT

### Minor changes

- Add a --clean or -c command line flag which runs the clean task.

## 2.7.3
Mon, 31 Jul 2017 21:18:26 GMT

### Patches

- Upgrade @types/semver to 5.3.33

## 2.7.2
Thu, 27 Jul 2017 01:04:48 GMT

### Patches

- Upgrade to the TS2.4 version of the build tools.

## 2.7.1
Tue, 25 Jul 2017 20:03:31 GMT

### Patches

- Upgrade to TypeScript 2.4

## 2.7.0
Wed, 12 Jul 2017 01:04:36 GMT

### Minor changes

- Add the ability to suppress warnings and errors via a regular expression

## 2.6.0
Fri, 07 Jul 2017 01:02:28 GMT

### Minor changes

- Enable StrictNullChecks.

## 2.5.6
Thu, 29 Jun 2017 01:05:37 GMT

### Patches

- Improve watch() so that it will automatically begin excecuting and it will not exit if there is a failure on the initial build

## 2.5.5
Wed, 21 Jun 2017 04:19:35 GMT

### Patches

- Add missing API Extractor release tags

## 2.5.3
Wed, 31 May 2017 01:08:33 GMT

### Patches

- Normalizing slashes in warnings suppressions to suppress warnings across windows and 'nix.

## 2.5.2
Wed, 24 May 2017 01:27:16 GMT

### Patches

- Only show overriden errors and warnings when we are in verbose mode.

## 2.5.1
Tue, 16 May 2017 21:17:17 GMT

### Patches

- Fixing an issue with how the GCB schema validator handles errors.

## 2.5.0
Mon, 24 Apr 2017 22:01:17 GMT

### Minor changes

- Adding `libES6Folder` setting to build config to optionally instruct tasks to output es6 modules.

## 2.4.4
Wed, 19 Apr 2017 20:18:06 GMT

### Patches

- Remove ES6 Promise & @types/es6-promise typings

## 2.4.3
Mon, 20 Mar 2017 21:52:20 GMT

*Version update only*

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

