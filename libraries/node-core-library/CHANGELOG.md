# Change Log - @rushstack/node-core-library

This log was last generated on Thu, 28 May 2020 05:59:02 GMT and should not be manually modified.

## 3.23.1
Thu, 28 May 2020 05:59:02 GMT

### Patches

- Improve async callstacks for FileSystem API (when using Node 12)

## 3.23.0
Wed, 27 May 2020 05:15:10 GMT

### Minor changes

- Add an "FileSystemStats" alias to avoid the need to import "fs" when using the FileSystem API
- Add FileSystem.readLink() and readLinkAsync()

## 3.22.1
Tue, 26 May 2020 23:00:25 GMT

### Patches

- Make not-exist error messages more readable.

## 3.22.0
Fri, 22 May 2020 15:08:42 GMT

### Minor changes

- Expose string parsing APIs from JsonFile.

## 3.21.0
Thu, 21 May 2020 23:09:44 GMT

### Minor changes

- Create async versions of FileSystem and JsonFile APIs.

## 3.20.0
Thu, 21 May 2020 15:41:59 GMT

### Minor changes

- Add PackageNameParser class, which is a configurable version of the PackageName API

## 3.19.7
Wed, 08 Apr 2020 04:07:34 GMT

*Version update only*

## 3.19.6
Sat, 28 Mar 2020 00:37:16 GMT

*Version update only*

## 3.19.5
Wed, 18 Mar 2020 15:07:47 GMT

### Patches

- Upgrade cyclic dependencies

## 3.19.4
Tue, 17 Mar 2020 23:55:58 GMT

### Patches

- PACKAGE NAME CHANGE: The NPM scope was changed from `@microsoft/node-core-library` to `@rushstack/node-core-library`

## 3.19.3
Tue, 28 Jan 2020 02:23:44 GMT

### Patches

- Fix a typing issue that prevented LegacyAdapters from being used with the new glob typings.

## 3.19.2
Thu, 23 Jan 2020 01:07:56 GMT

### Patches

- Fix an issue with a missing type in LegacyAdapters

## 3.19.1
Tue, 21 Jan 2020 21:56:14 GMT

*Version update only*

## 3.19.0
Sun, 19 Jan 2020 02:26:52 GMT

### Minor changes

- Upgrade Node typings to Node 10

## 3.18.3
Fri, 17 Jan 2020 01:08:23 GMT

*Version update only*

## 3.18.2
Thu, 09 Jan 2020 06:44:13 GMT

*Version update only*

## 3.18.1
Wed, 08 Jan 2020 00:11:31 GMT

*Version update only*

## 3.18.0
Fri, 15 Nov 2019 04:50:50 GMT

### Minor changes

- Add NewlineKind.OsDefault and fix some comments

## 3.17.1
Mon, 11 Nov 2019 16:07:56 GMT

*Version update only*

## 3.17.0
Tue, 05 Nov 2019 06:49:28 GMT

### Minor changes

- Add new API LegacyAdapters.stableSort(), and update the Sort API to be stable

## 3.16.0
Tue, 22 Oct 2019 06:24:44 GMT

### Minor changes

- Add JsonObject type

### Patches

- Refactor some code as part of migration from TSLint to ESLint

## 3.15.1
Sun, 29 Sep 2019 23:56:29 GMT

### Patches

- Update repository URL

## 3.15.0
Mon, 23 Sep 2019 15:14:55 GMT

### Minor changes

- Upgrade @types/node dependency and remove unnecessary dependencies on @types/fs-extra, @types/jju, and @types/z-schema

## 3.14.2
Tue, 10 Sep 2019 22:32:23 GMT

### Patches

- Update documentation

## 3.14.1
Wed, 04 Sep 2019 18:28:06 GMT

### Patches

- Add support for two more arguments in LegacyAdapters.convertCallbackToPromise.

## 3.14.0
Thu, 08 Aug 2019 15:14:17 GMT

### Minor changes

- Remove experimental IPackageJsonTsdocConfiguration API, since the "tsdocFlavor" field is no longer used by API Extractor

## 3.13.0
Wed, 20 Mar 2019 19:14:49 GMT

### Minor changes

- Introduce an interface INodePackageJson for loading package.json files whose "version" field may be missing.
- Add two new APIs PackageJsonLookup.loadNodePackageJson() and tryLoadNodePackageJsonFor() that return INodePackageJson

## 3.12.1
Mon, 18 Mar 2019 04:28:43 GMT

### Patches

- Export ColorValue and TextAttribute to eliminate the ae-forgotten-export warning

## 3.12.0
Wed, 27 Feb 2019 22:13:58 GMT

### Minor changes

- Treat `types` as an alias for `typings` in package.json

## 3.11.1
Wed, 27 Feb 2019 17:13:17 GMT

### Patches

- Include an enum that had been missing from the exports.

## 3.11.0
Mon, 18 Feb 2019 17:13:23 GMT

### Minor changes

- Exposing field tsdocMetadata in package.json

## 3.10.0
Mon, 11 Feb 2019 03:31:55 GMT

### Minor changes

- Include support for text formatting in the Terminal API.
- Add new API `InternalError.breakInDebugger`

### Patches

- Exposing utility class StringBufferTerminalProvider, useful to clients of Terminal API for their own unit tests

## 3.9.0
Thu, 10 Jan 2019 01:57:52 GMT

### Minor changes

- Remove deprecated FileDiffTest API for unit tests; please use Jest snapshots instead

## 3.8.3
Wed, 19 Dec 2018 05:57:33 GMT

### Patches

- Add missing space in error message

## 3.8.2
Thu, 13 Dec 2018 02:58:10 GMT

### Patches

- Use @types/jju not custom typings

## 3.8.1
Wed, 12 Dec 2018 17:04:19 GMT

### Patches

- Clarify error message reported by JsonFile._validateNoUndefinedMembers()

## 3.8.0
Fri, 07 Dec 2018 17:04:56 GMT

### Minor changes

- Added a new "InternalError" API for reporting software defects

## 3.7.1
Thu, 29 Nov 2018 07:02:09 GMT

### Patches

- Improve Sort.compareByValue() to consistently order "null" and "undefined" values

## 3.7.0
Wed, 28 Nov 2018 02:17:11 GMT

### Minor changes

- Add new API PackageJsonLookup.loadOwnPackageJson()

## 3.6.0
Fri, 16 Nov 2018 21:37:10 GMT

### Minor changes

- Add new APIs Sort.sortSet() and Sort.sortSetBy()

## 3.5.2
Wed, 07 Nov 2018 21:04:35 GMT

### Patches

- Upgrade fs-extra to eliminate the "ERROR: ENOTEMPTY: directory not empty, rmdir" error that sometimes occurred with FileSystem.deleteFolder()

## 3.5.1
Mon, 05 Nov 2018 17:04:24 GMT

### Patches

- Remove all dependencies on the "rimraf" library

## 3.5.0
Thu, 25 Oct 2018 23:20:40 GMT

### Minor changes

- Add Sort API

## 3.4.0
Wed, 24 Oct 2018 16:03:10 GMT

### Minor changes

- Adding Terminal API.

## 3.3.1
Wed, 17 Oct 2018 21:04:49 GMT

### Patches

- Remove use of a deprecated Buffer API.

## 3.3.0
Mon, 08 Oct 2018 16:04:27 GMT

### Minor changes

- Renaming PromiseUtilities to LegacyAdapters

## 3.2.0
Sun, 07 Oct 2018 06:15:56 GMT

### Minor changes

- Introduce promiseify utility function.

### Patches

- Update documentation

## 3.1.0
Fri, 28 Sep 2018 16:05:35 GMT

### Minor changes

- Add `Path.isUnderOrEquals()`

## 3.0.1
Thu, 06 Sep 2018 01:25:26 GMT

### Patches

- Update "repository" field in package.json

## 3.0.0
Wed, 29 Aug 2018 06:36:50 GMT

### Breaking changes

- (Breaking API change) The FileSystem move/copy/createLink operations now require the source/target parameters to be explicitly specified, to avoid confusion

## 2.2.1
Thu, 23 Aug 2018 18:18:53 GMT

### Patches

- Republish all packages in web-build-tools to resolve GitHub issue #782

## 2.2.0
Wed, 22 Aug 2018 20:58:58 GMT

### Minor changes

- Add features to JsonFile API to update an existing JSON file while preserving comments and whitespace

## 2.1.1
Wed, 22 Aug 2018 16:03:25 GMT

### Patches

- Fix an issue where Executable.spawnSync() was returning SpawnSyncReturns<Buffer> instead of SpawnSyncReturns<string>
- Fix an issue where Executable.spawnSync() did not support command paths containing spaces

## 2.1.0
Thu, 09 Aug 2018 21:03:22 GMT

### Minor changes

- Add a new API "Executable" for spawning child processes

## 2.0.0
Thu, 26 Jul 2018 16:04:17 GMT

### Breaking changes

- Replace IFileModeBits with a more flexible PosixModeBits enum
- Rename FileSystem.changePermissionBits() to changePosixModeBits()

### Minor changes

- Add new APIs FileSystem.getPosixModeBits() and FileSystem.formatPosixModeBits()

## 1.5.0
Tue, 03 Jul 2018 21:03:31 GMT

### Minor changes

- Add a FileSystem API that wraps and replaces fs and fs-extra

## 1.4.1
Thu, 21 Jun 2018 08:27:29 GMT

### Patches

- issue #705: fallback on linux to /proc/{n}/stat if 'ps -p 1 -o lstart' is not supported

## 1.4.0
Fri, 08 Jun 2018 08:43:52 GMT

### Minor changes

- Add Text.truncateWithEllipsis() API

## 1.3.2
Thu, 31 May 2018 01:39:33 GMT

### Patches

- Add missing "repository" property in IPackageJSON.

## 1.3.1
Tue, 15 May 2018 02:26:45 GMT

### Patches

- Fix an issue where the PackageName class could not parse the package name "Base64"

## 1.3.0
Fri, 04 May 2018 00:42:38 GMT

### Minor changes

- Update the package resolution logic to preserve symlinks in paths

## 1.2.0
Tue, 03 Apr 2018 16:05:29 GMT

### Minor changes

- Add a new API "MapExtensions.mergeFromMap"

## 1.1.0
Mon, 02 Apr 2018 16:05:24 GMT

### Minor changes

- Add new API "PackageName" for validating package names and extracting scopes
- Add new API "ProtectableMap" for tracking/restricting how a map is consumed

## 1.0.0
Sat, 17 Mar 2018 02:54:22 GMT

### Breaking changes

- Redesign the PackageJsonLookup API. This is a breaking change.

### Minor changes

- Add new APIs IPackageJson, FileConstants, and FolderConstants

### Patches

- Add "tsdoc" field to the IPackageJson API
- Improve PackageJsonLookup.tryGetPackageFolderFor() to deduplicate symlinks by using fs.realpathSync()

## 0.8.0
Thu, 15 Mar 2018 16:05:43 GMT

### Minor changes

- Add new Text API

## 0.7.3
Fri, 02 Mar 2018 01:13:59 GMT

*Version update only*

## 0.7.2
Tue, 27 Feb 2018 22:05:57 GMT

### Patches

- Fix an issue where the LockFile was unable to acquire the lock if the resource dir doesn't exist.

## 0.7.1
Wed, 21 Feb 2018 22:04:19 GMT

*Version update only*

## 0.7.0
Wed, 21 Feb 2018 03:13:28 GMT

### Minor changes

- Add "Path.isUnder()" API

## 0.6.1
Sat, 17 Feb 2018 02:53:49 GMT

### Patches

- Fix an issue for LockFiles where not all filesystem operations were wrapped in a try/catch block.

## 0.6.0
Fri, 16 Feb 2018 22:05:23 GMT

### Minor changes

- Add an API to `LockFile` which allows the caller to asyncronously wait for a LockFile to become available.

## 0.5.1
Fri, 16 Feb 2018 17:05:11 GMT

*Version update only*

## 0.5.0
Wed, 07 Feb 2018 17:05:11 GMT

### Minor changes

- Add a LockFile class to work with LockFile's that manage resources across multiple processes.

## 0.4.10
Fri, 26 Jan 2018 22:05:30 GMT

*Version update only*

## 0.4.9
Fri, 26 Jan 2018 17:53:38 GMT

### Patches

- Force a patch bump in case the previous version was an empty package

## 0.4.8
Fri, 26 Jan 2018 00:36:51 GMT

*Version update only*

## 0.4.7
Tue, 23 Jan 2018 17:05:28 GMT

*Version update only*

## 0.4.6
Thu, 18 Jan 2018 03:23:46 GMT

*Version update only*

## 0.4.5
Thu, 18 Jan 2018 00:48:06 GMT

*Version update only*

## 0.4.4
Thu, 18 Jan 2018 00:27:23 GMT

### Patches

- Enable package typings generated by api-extractor

## 0.4.3
Wed, 17 Jan 2018 10:49:31 GMT

*Version update only*

## 0.4.2
Fri, 12 Jan 2018 03:35:22 GMT

*Version update only*

## 0.4.1
Thu, 11 Jan 2018 22:31:51 GMT

*Version update only*

## 0.4.0
Wed, 10 Jan 2018 20:40:01 GMT

### Minor changes

- Upgrade to Node 8

## 0.3.26
Tue, 09 Jan 2018 17:05:51 GMT

### Patches

- Get web-build-tools building with pnpm

## 0.3.25
Sun, 07 Jan 2018 05:12:08 GMT

*Version update only*

## 0.3.24
Fri, 05 Jan 2018 20:26:45 GMT

*Version update only*

## 0.3.23
Fri, 05 Jan 2018 00:48:41 GMT

*Version update only*

## 0.3.22
Fri, 22 Dec 2017 17:04:46 GMT

*Version update only*

## 0.3.21
Tue, 12 Dec 2017 03:33:27 GMT

*Version update only*

## 0.3.20
Thu, 30 Nov 2017 23:59:09 GMT

*Version update only*

## 0.3.19
Thu, 30 Nov 2017 23:12:21 GMT

*Version update only*

## 0.3.18
Wed, 29 Nov 2017 17:05:37 GMT

*Version update only*

## 0.3.17
Tue, 28 Nov 2017 23:43:55 GMT

*Version update only*

## 0.3.16
Mon, 13 Nov 2017 17:04:50 GMT

*Version update only*

## 0.3.15
Mon, 06 Nov 2017 17:04:18 GMT

*Version update only*

## 0.3.14
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 0.3.13
Wed, 01 Nov 2017 21:06:08 GMT

### Patches

- Upgrade cyclic dependencies

## 0.3.12
Tue, 31 Oct 2017 21:04:04 GMT

*Version update only*

## 0.3.11
Tue, 31 Oct 2017 16:04:55 GMT

*Version update only*

## 0.3.10
Wed, 25 Oct 2017 20:03:59 GMT

*Version update only*

## 0.3.9
Tue, 24 Oct 2017 18:17:12 GMT

*Version update only*

## 0.3.8
Mon, 23 Oct 2017 21:53:12 GMT

### Patches

- Updated cyclic dependencies

## 0.3.7
Fri, 20 Oct 2017 19:57:12 GMT

*Version update only*

## 0.3.6
Fri, 20 Oct 2017 01:52:54 GMT

*Version update only*

## 0.3.5
Fri, 20 Oct 2017 01:04:44 GMT

*Version update only*

## 0.3.4
Fri, 13 Oct 2017 19:02:46 GMT

### Patches

- When FileDiffTest creates a copy of the expected output for comparison, it is now marked as read-only to avoid confusion

## 0.3.3
Thu, 05 Oct 2017 01:05:02 GMT

*Version update only*

## 0.3.2
Fri, 29 Sep 2017 01:03:42 GMT

### Patches

- FileDiffTest now copies the expected file into the same folder as the actual file for easier comparisons

## 0.3.1
Thu, 28 Sep 2017 01:04:28 GMT

*Version update only*

## 0.3.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 0.2.11
Wed, 20 Sep 2017 22:10:17 GMT

*Version update only*

## 0.2.10
Mon, 11 Sep 2017 13:04:55 GMT

*Version update only*

## 0.2.9
Fri, 08 Sep 2017 13:04:00 GMT

### Patches

- Improve error reporting for JsonFile.validateNoUndefinedMembers()

## 0.2.8
Fri, 08 Sep 2017 01:28:04 GMT

### Patches

- Deprecate @types/es6-coll ections in favor of built-in typescript typings 'es2015.collection' a nd 'es2015.iterable'

## 0.2.7
Thu, 07 Sep 2017 13:04:35 GMT

*Version update only*

## 0.2.6
Thu, 07 Sep 2017 00:11:12 GMT

*Version update only*

## 0.2.5
Wed, 06 Sep 2017 13:03:42 GMT

*Version update only*

## 0.2.4
Tue, 05 Sep 2017 19:03:56 GMT

*Version update only*

## 0.2.3
Sat, 02 Sep 2017 01:04:26 GMT

*Version update only*

## 0.2.2
Thu, 31 Aug 2017 18:41:18 GMT

*Version update only*

## 0.2.1
Thu, 31 Aug 2017 17:46:25 GMT

*Version update only*

## 0.2.0
Wed, 30 Aug 2017 01:04:34 GMT

### Minor changes

- Initial implementation of DiffTest, JsonFile, and PackageJsonLookup

