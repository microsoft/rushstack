# Change Log - @microsoft/rush-lib

This log was last generated on Fri, 21 Jul 2017 22:34:44 GMT and should not be manually modified.

## 3.0.12
Fri, Jul 21, 2017 22:30:12 GMT

### Patches

- Temporarily revert Rush incremental build checking files outside of the project's directory
- Fix error message during build
- Add a ChangeFile class to rush-lib
- Fix an issue where rush would crash if it could not find the rush.json
- If "rush generate" detects that all dependencies are present, it will do nothing. This is overridable with the "--force" flag.
- Promote Changelog interfaces to an @alpha API in rush-lib

## 3.0.11
Mon, Jul  3, 2017 10:53:12 PM

### Patches

- Rush 3.0.11 was released.

## 3.0.10
Tue, 27 Jun 2017 21:44:50 GMT

### Patches

- Fix an issue with 'rush rebuild' where it fails on non-windows platforms
- Fix an issue with 'rush -help' where it throws if rush.json is not available.

## 3.0.9
Thu, June 8, 2017 03:30:27 GMT

### Patches

- Fix issue with Version Mismatch Finder (used by 'rush check') where it sometimes threw exceptions

## 3.0.8
Thu, June 8, 2017 03:00:27 GMT

### Patches

- Fix issue with Version Mismatch Finder (used by 'rush check') so it no longer considers cyclic dependencies as a mismatch.

## 3.0.7
Tue, May 20, 2017 00:55:27 GMT

### Patches

- Rush 3.0.7 was released.

## 3.0.6
Sat, May 20, 2017 00:55:27 GMT

### Patches

- Rush 3.0.6 was released.

## 3.0.5
Fri, May 19, 2017 10:55:27 GMT

### Patches

- Rush 3.0.5 was released.

## 3.0.4
Tue, May 17, 2017 01:48:27 GMT

### Patches

- Rush 3.0.4 was released.

## 3.0.3
Tue, May 16, 2017 00:43:27 GMT

### Patches

- Rush 3.0.3 was released.

## 3.0.2
Sun, May 14, 2017 19:22:16 GMT

### Breaking changes

- Rush 3.0.2 was released.

## 3.0.1
Sun, May 14, 2017 18:30:35 GMT

### Breaking changes

- Rush 3 was released.

## 2.5.0
Tue, 11 Apr 2017 21:20:58 GMT

### Minor changes

- Deprecate the pinnedVersions field of rush.json in favor of a standalone pinnedVersions.json

### Patches

- Bump stream-collator to 2.0.0

## 2.4.0
Thu, 30 Mar 2017 18:25:38 GMT

### Minor changes

- The 'link' action will be automatically ran after 'install' or 'generate'.
- Support adding a suffix during rush generate

### Patches

- Fixing an issue where install was not detecting changes to the shrinkwrap
- Registry should not be hardcoded when auth token is provided

## 2.3.0
Fri, 24 Feb 2017 22:53:18 GMT

### Minor changes

- Get package versions aligned with @microsoft/rush-lib
- Get package versions aligned with @microsoft/rush

## 1.10.0
Fri, 24 Feb 2017 22:44:31 GMT

### Minor changes

- Add a "pinnedVersions" option to rush.json, which will add dependencies to the common package.json. Since these dependencies are installed first, this mechanism can be used to control versions of unconstrained second-level dependencies.

### Patches

- Rush will automatically create the common folder.

## 1.8.0
Tue, 14 Feb 2017 22:53:30 GMT

### Minor changes

- Install will error if the temp_modules have drifted out of sync with the package's package.json files

## 1.7.0
Tue, 14 Feb 2017 02:31:40 GMT

### Minor changes

- Adds an extra utility (VersionMismatchFinder), which can locate inconsistencies in versions of dependencies across the repo.

## 1.5.2
Sun, 05 Feb 2017 01:21:30 GMT

### Patches

- Lock version numbers for @types packages
- Update .npmignore

## 1.5.1
Tue, 24 Jan 2017 03:26:06 GMT

*Changes not tracked*

## 1.5.0
Sun, 22 Jan 2017 02:04:57 GMT

### Minor changes

- Update to TypeScript 2.1
- Added new rush.json settings under "gitPolicy"

## 1.4.1
Tue, 03 Jan 2017 20:44:26 GMT

### Minor changes

- More changes for RC0 release.

## 1.4.0
Tue, 06 Dec 2016 20:44:26 GMT

### Minor changes

- Changes for RC0 release.

