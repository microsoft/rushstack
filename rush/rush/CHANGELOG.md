# Change Log - @microsoft/rush

This log was last generated on Fri, 24 Feb 2017 22:54:16 GMT and should not be manually modified.

## 2.3.0
Fri, 24 Feb 2017 22:54:16 GMT

### Minor changes

- Minor version

## 2.2.1
Fri, 24 Feb 2017 22:53:18 GMT

*Changes not tracked*

## 2.2.0
Fri, 24 Feb 2017 22:44:31 GMT

### Minor changes

- Add a "pinnedVersions" option to rush.json, which will add dependencies to the common package.json. Since these dependencies are installed first, this mechanism can be used to control versions of unconstrained second-level dependencies.
- Make --quiet builds the default. Deprecate the --quiet parameter. Add a --verbose parameter which displays the build logs.

### Patches

- Rush install checks to ensure that generate has been run.

## 1.8.2
Wed, 15 Feb 2017 08:54:44 GMT

### Patches

- Temporarily reverting the new temp_modules validation feature, because it is incompatible with some usage scenarios

## 1.8.1
Tue, 14 Feb 2017 23:40:44 GMT

### Patches

- Fixing a bug with install where it preemptively returned before installing.

## 1.8.0
Tue, 14 Feb 2017 22:53:30 GMT

### Minor changes

- Install will error if the temp_modules have drifted out of sync with the package's package.json files

## 1.7.0
Tue, 14 Feb 2017 02:31:40 GMT

### Minor changes

- Adds an extra command (rush check-versions), which can find inconsistencies in package.json dependency versions across a repository.

## 1.6.0
Sun, 05 Feb 2017 01:21:30 GMT

### Minor changes

- Add support for pre-release build

### Patches

- When the git policy fails, rush should return a non-zero error code.
- Lock version numbers for @types packages
- Ensure world readiness
- Update .npmignore
- Cyclic dependency should not have version bumped when changes are applied.

## 1.5.1
Tue, 24 Jan 2017 03:26:05 GMT

### Patches

- The 'link' command should display elapsed time when finished executing.
- Minor fix so "allowedEmailRegExps" works on Mac/Linux
- Fixed a small bug where "rush publish -a" was not deleting changelog files

## 1.5.0
Sun, 22 Jan 2017 02:04:57 GMT

### Minor changes

- Implemented a new rush.json option "gitPolicy" to avoid incorrect commit e-mails

### Patches

- Update temp_modules when versions are bumped. 

## 1.4.1
Tue, 03 Jan 2017 21:52:49 GMT

### Patches

- Fixing `rush publish` changelog code to reference projects correctly.
- `rush publish` now only updates changelogs for projects that are marked as shouldPublish=true.

## 1.4.0
Tue, 06 Dec 2016 20:44:26 GMT

### Minor changes

- Changes for RC0 release.

## 1.3.0
Sat, 03 Dec 2016 07:47:39 GMT

### Minor changes

- Adding support for changelog generation to rush publish.
- Refactoring "config" into "configuration."

### Patches

- Converting node and webpack-env typings to use @types, and cleaning them up.
- The cache should be cleaned unless we are using the global cache
- Fixed a regression where "rush install" would sometimes corrupt the node_modules folder.  Also, common/package.json is now sorted deterministically.

## 1.2.4

### Patches

- If the `test`, `clean`, or `build` commands are defined in the package.json, but are empty strings, then do a no-op during the build.

## 1.2.3

### Patches

- Make deletion of node_modules folder more cautious to improve failure rate on automated builds.
- Updating Rush generate to more efficiently delete folders.

## 1.2.2

### Patches

- Updating the deps hash dependency, which includes a fix which resolves a bug where changes were not being recalculated when multiple files were changed.

## 1.2.1

### Patches

- Updating the rush `change` with better verification logic.

## 1.2.0

### Minor changes

- Adding the 'build' action, which support incremental build.

## 1.1.3

### Patches

- Partially reverting changes for treating success with warnings differently.
- Making Rush install transactional.

## 1.1.2

### Patches

- Fix a bug in rush `change`

## 1.1.1

### Patches

- correcting casing of files and imports

## 1.1.0

### Minor changes

- The "packageReviewFile" feature now supports a setting "ignoredNpmScopes" that can be used e.g. to ignore the "@types" scope

### Patches

- Fixing Rush to run on UNIX and Linux.

## 1.0.10

### Breaking changes

- Rename `shouldTrackChanges` to `shouldPublish` which indicates whether a package should be included for the `publish` workflow.

### Minor changes

- Updating `rush install` to be transactional.

### Patches

- Updating the `publish` workflow.

## 1.0.9

### Patches

- Updating the `publish` workflow.

## 1.0.7

### Patches

- Renaming the `local-npm` directory to `npm-local`.
- Include NPM --cache and NPM --tmp options in the rush.json file.
- Limit Rush Rebuild parallelism to 'number-of-cores' simultaneous builds, optionally overridable on command line

## 1.0.5

### Patches

- Fixed a bug in Rush Generate which showed: `ERROR: Input file not found: undefined` when packageReviewFile is omitted

## 1.0.4

### Minor changes

- Added optional support for a "packageReviewFile" that helps detect when new NPM package dependencies are introduced

### Patches

- Replaced JSON.parse() with jju for improved error handling.

## 1.0.3

### Patches

- Fix Mac OS X compatibility issue

## 1.0.0

*Initial release*

