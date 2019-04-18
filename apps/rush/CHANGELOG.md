# Change Log - @microsoft/rush

This log was last generated on Mon, 15 Apr 2019 06:40:00 GMT and should not be manually modified.

## 5.6.4
Mon, 15 Apr 2019 06:40:00 GMT

### Updates

- Add support for string parameter for custom commands.
- Remove the obsolete "--release-type" option which only worked if you used a specific version of gulp-core-build-typescript
- Adds --no-verify to git push during a rush publish

## 5.6.3
Mon, 25 Mar 2019 03:15:21 GMT

### Updates

- Update the "rush init" template with a .gitattributes rule to allow comments in JSON files
- Add ability to publish partial prereleases

## 5.6.2
Thu, 21 Mar 2019 23:09:56 GMT

### Updates

- Publish: pass auth token through to npm view when checking if package exists

## 5.6.1
Mon, 18 Mar 2019 04:48:37 GMT

### Updates

- Remove the "rush check" step from the travis.yml template, since this is now handled by "ensureConsistentVersions" from rush.json
- Improve "rush change" to ignore the ".git" file extension when appended to the "repository.url" setting in rush.json

## 5.6.0
Fri, 15 Mar 2019 03:21:02 GMT

### Minor changes

- Add "--set-access-level" parameter for "rush publish" to control whether NPM packages are published as "public" or "restricted"
- Add a "dependencies" configuration property to version-policies.json to customize the way dependency versions are published and stored in source control

### Updates

- Add support for the Yarn --ignore-engines, exposed as yarnOptions.ignoreEngines in rush.json
- Add the ability to configure the version bump and publish git commit message, exposed as gitPolicy.versionBumpCommitMessage in rush.json
- Fix an issue with "rush publish --pack" when using yarn.
- Remove the "rush check" step from the travis.yml template, since this is now handled by "ensureConsistentVersions" from rush.json
- Fix an issue where "rush change" sometimes could not detect changes correctly when invoked on a forked GitHub repo
- Fix an issue where "rushx" and "rush build" did not search for commands in the current project's local node_modules/.bin folder (GitHub issue #706)
- The `--debug` parameter now automatically breaks in the debugger when an InternalError is thrown
- Support overriding 'build' and 'rebuild' commands in command-line.json
- Update README.md
- Change "rush build" to print stdout if stderr is empty and a task fails. This improves Webpack support

## 5.5.4
Thu, 13 Dec 2018 02:58:10 GMT

### Patches

- Remove unused jju dependency

### Updates

- Properly handle Git worktrees
- Updated to use the new InternalError class for reporting software defects

## 5.5.3
Wed, 05 Dec 2018 20:14:08 GMT

### Updates

- Add user read permission to copied Git hooks

## 5.5.2
Fri, 09 Nov 2018 02:14:11 GMT

### Updates

- Include an environment variable option to create symlinks with absolute paths.

## 5.5.1
Wed, 07 Nov 2018 21:04:35 GMT

### Updates

- For NodeJS 10, require at least LTS (10.13.0)
- Install rush and package managers in a node version-specific folder under the user's home directory
- Added support for git hooks
- Remove all dependencies on the "rimraf" library
- Upgrade fs-extra to eliminate the annoying "ERROR: ENOTEMPTY: directory not empty, rmdir" error that occasionally occurred during "rush link"

## 5.4.0
Thu, 25 Oct 2018 23:20:40 GMT

### Updates

- Remove use of a deprecated Buffer API.
- Fix an issue with "rush change" on NodeJS 10.
- Fix an issue where "rush install" sometimes would incorrectly ask for "rush update", when using the Yarn package manager
- Improve sorting of @rush-temp projects, which may reduce churn of hashes in the shrinkwrap file
- Expose safeForSimultaneousRushProcesses to custom commands
- Add 'variants' feature and command-line parameter

## 5.3.4
Wed, 17 Oct 2018 03:19:43 GMT

### Updates

- Make rush purge also call rush unlink
- Fix an issue where "rush publish" invoked the wrong command when using Yarn
- Install optional dependencies, except w/ npm<5.0.0

## 5.3.3
Thu, 11 Oct 2018 23:58:16 GMT

### Updates

- Remove warning for NodeJS 10 now that it is stable (LTS)

## 5.3.2
Mon, 08 Oct 2018 23:19:51 GMT

### Updates

- Change "rush check" so that it considers "cyclicDependencyProjects" and ensures they are consistent or listed in "allowedAlternateVersions"
- Fix a recent regression where "rush link" was failing for NPM/Yarn because hard links don't support relative paths
- Make sure npm package does not exist before publishing

## 5.3.1
Wed, 03 Oct 2018 00:01:18 GMT

### Updates

- Fix an issue where after running "rush add" (after successfully running "rush install"), the new package was not being installed or linked.
- Fix an incorrect default in the "rush init" template comments

## 5.3.0
Fri, 28 Sep 2018 20:36:48 GMT

### Updates

- Add "ensureConsistentVersions" configuration which runs "rush check" before certain commands
- Add a new command "rush add" for managing package.json dependencies
- Rush now detects some package.json errors such as the same package name being listed in both "dependencies" and "optionalDependencies"
- Update "rush link" to use relative paths when creating symlinks, to facilitate building Docker images

## 5.2.1
Thu, 13 Sep 2018 21:57:21 GMT

### Updates

- Fix an issue where "rush init" failed because its ".gitignore" template was excluded from the package

## 5.2.0
Thu, 13 Sep 2018 19:34:37 GMT

### Updates

- Add a "rush init" command for scaffolding new monorepo folders
- Allow "rush scan" to be used without a rush.json configuration

## 5.1.0
Sat, 08 Sep 2018 20:57:32 GMT

### Updates

- Update "repository" field in package.json
- Add support for PNPM's --strict-peer-dependencies feature
- Add support for the Yarn package manager (this is a "beta" feature; please report any issues you encounter!)

## 5.0.6
Fri, 31 Aug 2018 23:10:31 GMT

### Updates

- Add "--prefer-frozen-shrinkwrap false" to the "pnpm install" command line as a workaround for https://github.com/pnpm/pnpm/issues/1342
- Skip validation of the Git email address if Git is not installed, or if rush.json isn't in a Git working directory, or if no policy was defined

## 5.0.5
Wed, 29 Aug 2018 07:05:22 GMT

### Updates

- Fix an issue where rush install will fail if git isn't installed.
- Fix an issue where "rush -h" didn't print help for the "build" and "rebuild" commands, unless invoked under a Rush folder
- Improve command-line help for "rush build"
- Fix regression causing "ERROR: EEXIST: file already exists"

## 5.0.4
Thu, 23 Aug 2018 00:08:41 GMT

### Updates

- Fix capitalization of new "filePath" API property

## 5.0.3
Wed, 22 Aug 2018 20:58:58 GMT

### Updates

- git st
- When saving config files, Rush should include the "$schema" directive
- Fix a regression where "rush version" sometimes failed with "The value for entries[0].comments.dependency[0].author is undefined"
- When updating common-versions.json and version-policies.json, preserve the existing comments and whitespace

## 5.0.2
Sat, 18 Aug 2018 01:27:39 GMT

*Version update only*

## 5.0.1
Sat, 18 Aug 2018 01:21:59 GMT

### Updates

- Fix typo in rush error message
- Add a flag to "rush install" which runs the package manager in a verbose logging mode.
- Remove package.json from rush-lib constants. Add public API for creating changefiles.
- Fix an issue where "rush version" would fail with a useless error message if the Git user email is not specified.
- Update lodash.
- Add a "--network-concurrency" command-line option to help troubleshoot the ECONNRESET error that people occasionally have reported ( https://github.com/pnpm/pnpm/issues/1230 )

## 5.0.0
Sat, 30 Jun 2018 00:57:22 GMT

### Updates

- Update peerDependencies when bumping package versions (issue #668)
- Add allowedAlternativeVersions setting to common-versions.json config file
- Fix an issue where PNPM shrinkwrap file parser did not handle relative/absolute version paths correctly
- Print each project's build time during the summary
- Fix an issue where the common/temp/.npmrc file could contain missing environment variable tokens
- Rush now creates common/scripts/install-run.js and install-run-rush.js scripts to formalize how CI jobs bootstrap tooling dependencies
- Enable the "rush rebuild" and "rush build" commands to work without a Git repository
- Add support for RUSH_TEMP_FOLDER environment variable to customize the location of Rush's commonTempFolder
- Fix an issue where if package-deps.json fails to parse, the build fails
- Improve "rush link" to create node_modules/.bin launchers for local project dependencies (not just installed external dependencies)
- Update rush.json schema to allow requested versions (e.g. Rush or the package manager) to be a prerelease SemVer pattern
- Fix annoyance where "rush update" (formerly "rush generate") would always change the integrity hash for tarball entries in shrinkwrap.yaml
- Fix an issue where Rush's .npmrc configuration was not honored when spawned via an NPM lifecycle script; in general the process environment is now more isolated
- Rush now warns when phantom node_modules folders are found
- Relax the rush.json version check for rush-lib; future versions are now accepted as long as the major/minor parts match
- Fix a regression where builds would sometimes fail with a zero exit code due to NodeJS's handling of uncaught Promise rejections
- Improve "rush check" to ignore peer dependencies, since they don't need to be consistent with everything else (and generally won't be)
- (Breaking change) Replace pinned-versions.json with a more general common-versions.json that can track other cross-project dependency versions
- (Breaking change) In common-versions.json, rename the "pinned versions" concept to "preferred versions", and separate the XStitch versions into their own field
- Report an error if the package manager version is too old
- (Breaking change) Redesign command-line.json config file to support other command types
- (Breaking change) Rename custom-commands.json to be command-line.json
- Add support for "global" commands in custom-commands.json
- When using PNPM, remove some NPM bug workarounds that probably caused problems for "pnpm install"
- Add a lock file to avoid race conditions when the Rush version selector is installing rush-lib
- Fix a problem where the "rush-recycler" folder was not getting cleaned on macOS
- (Breaking change) Remove unused RushConfiguration.homeFolder API
- Add RUSH_PREVIEW_VERSION environment variable for piloting new versions of Rush
- Add new command "rush purge" for cleaning up temporary files
- Fix an issue where rush-recycler wasn't emptied if a folder exceeded the Windows MAX_PATH
- Minor improvements for logging
- When installing tools, always copy the repo's .npmrc file to the target folder
- (Breaking change) Replace the "rush generate" command with a new command "rush update"
- (Breaking change) Replace "rush install --clean" and "--full-clean" with "rush install --purge"
- Improve lifecycle script execution to support Unix slashes in the command name when running on Windows
- Add "rushx" binary for single-project commands
- (Breaking change) Eliminate extra letters from shortened command line options (renamed "-cpo" to "-o", and removed "-vp" and "-pn")
- Add check for unpublished releases
- Add a "--to-version-policy" option for "rush rebuild" to allow building only a particular version policy
- Add --release-type parameter to "rush publish" to be able to create different tarballs based on release type
- Add "--ensure-version-policy" option for "rush version" to support updating the versions directly

## 4.3.3
Thu, 31 May 2018 21:57:13 GMT

### Updates

- Remove the old undocumented "rush purge" command, since it conflicts with Rush 5

## 4.3.2
Mon, 26 Mar 2018 19:12:42 GMT

### Updates

- Change *.d.ts file path for rush-lib
- Add "ignoreMissingScript" flag to custom command and fix other minor issues
- Add --pack option to "rush publish" to support packing packages into tarballs instead of publishing to NPM registry
- Upgrade colors to version ~1.2.1

## 4.3.1
Tue, 20 Mar 2018 20:02:56 GMT

### Updates

- Add support for overriding the default windows parallelism with 'max'.
- Remove IPackageJson API. Consumers should now use the equivalent definition from @microsoft/node-core-library instead.
- Move the environment checks from rush-lib to rush
- Fix an annoyance where common/temp/shrinkwrap.yaml was formatted in a way that made diffs less readable

## 4.3.0
Fri, 02 Mar 2018 02:45:37 GMT

### Updates

- Fix an issue where we always deleted the pnpm store. This is not necessary since the store is transactional. We should only delete the store if it is a --clean install.
- Fix an issue where the package manager installation could get corrupted if the Rush tool was accidentally invoked multiple times concurrently.
- Fix issue with pnpm where store was not removed after an unsuccessful installation
- When Rush links PNPM packages to their dependencies, it should link to the realpath, rather than linking to the symlink. This will improve performance of builds by reducing the number of file system reads that are needed.
- Update Rush to consider the shrinkwrap file during incremental builds.
- Add a --changed-projects-only flag to 'rush build', which will skip rebuilding of downstream packages. It will only rebuild projects that change, but not their dependents.
- Add a locking mechanism around certain rush commands so only one process can be working in a Rush repository at a single point in time. This is useful for commands that may corrupt each other, like generate, install, link, and rebuild.
- When using pnpm, Rush will check and see if other projects are using a dependency and will re-use it if possible. This way, a user will not have to run "rush generate" if they are adding a dependency that is already being used elsewhere in the monorepo.
- Add a notice for unsupported versions of NodeJS runtime
- Add a new command-line flag "--conservative" which causes "rush generate" to perform a minimal upgrade
- Improved "rush generate" so that if interrupted, it does not leave you with a deleted shrinkwrap.yaml; the new integrity checks eliminate the need for this, and it was annoying
- Fix Rush version increase logic to handle cyclic dependencies properly

## 4.2.5
Fri, 26 Jan 2018 00:36:51 GMT

### Updates

- Fix an issue when parsing scoped peer dependencies in the pnpm shrinkwrap file

## 4.2.4
Sun, 21 Jan 2018 06:33:59 GMT

### Updates

- Improve the error message when loading rush.json from a newer release

## 4.2.3
Thu, 18 Jan 2018 19:02:07 GMT

### Updates

- Avoid git errors when there are only empty change files

## 4.2.2
Wed, 17 Jan 2018 10:49:31 GMT

*Version update only*

## 4.2.1
Fri, 12 Jan 2018 23:35:48 GMT

### Patches

- Fix a bug in "rush change" to allow skipping changes when empty change file exists.
- Change the way Rush prints output, to make it more readable and easy to tell how far into a build you are.

## 4.2.0
Mon, 11 Jan 2018 22:14:30 GMT

### Minor changes

- Introduce a new project-specific setting "skipRushCheck" to exempt certain projects from the "rush check" validation
- Introduce a new setting "mainProject" for lockstep version policies. This enables a scenario where a group of packages share a common change log, which is associated with the main project.

## 4.1.1
Mon, 08 Jan 2018 20:34:30 GMT

### Patches

- Fix an issue with checking the pnpm shrinkwrap file when there are peer dependency version specifiers

## 4.1.0
Thu, 30 Nov 2017 20:34:30 GMT

### Minor changes

- Adding support for using PNPM with Rush

### Patches

- Fix issue where 'rush publish' was failing when the only changefiles were 'none' type
- Add support for hotfix changes
- Fix an issue with file locks causing exceptions during 'rush install'
- Fix issue where 'rush install' did not invalidate node_modules after bumping package manager version

## 4.0.1
Mon, 13 Nov 2017 18:34:30 GMT

### Patches

- Fix the regression where "rush -h" didn't work outside a repo folder
- Reduce the default parallelism on Windows platform
- Force change log name to be the same as package name to handle the error case when package is renamed but change log is not

## 4.0.0
Sat, 4 Nov 2017 03:22:28 GMT

### Breaking changes

- Complete release notes are here: https://github.com/Microsoft/web-build-tools/wiki#november-3-2017---rush-4-released
- Adding custom commands and options.
- Adding rush version selector.
- Updating the semantics of rush change.

## 3.0.20
Thu, 19 Oct 2017 23:01:49 GMT

### Patches

- Fix a stack overflow error that occurs when "rush rebuild" encounters a cyclic dependency
- Fix a bug that "rush rebuild" fails if "from" parameter is provided
- Validate versions before "rush version" commits version updates

## 3.0.19
Fri, 06 Oct 2017 22:44:31 GMT

### Patches

- Enable strickNullChecks
- Fix a bug in "rush version" that devdependency does not get bumped if there is no dependency. 
- Fix a bug in "rush change" so it handles rename properly. 
- Add npm tag support in "rush publish". 

## 3.0.18
Tue, 26 Sep 2017 13:51:05 GMT

### Patches

- Update various dependencies

## 3.0.17
Thu, 14 Sep 2017 18:51:05 GMT

### Patches

- Fix some issues in rush telemetry collection

## 3.0.16
Wed, 6 Sep 2017 18:24:39 GMT

### Patches

- Fix an issue running 'rush install' after adding a new project

## 3.0.15
Wed, 30 Aug 2017 18:24:39 GMT

### Patches

- Replace the temp_modules/*/package.json files with TGZ files
- Add repositoryUrl to RushConfiguration to track remote repository
- Use the new Json API from node-core-library
- Add two new methods to ChangeFile class
- Introduce an experimental "rush version" action to manage project versions based on version policy
- Make "rush generate" not throw if there is a problem reading the shrinkwrap file

## 3.0.12
Fri, Jul 21, 2017 22:30:12 PM

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

- Add support for non-SemVer dependency specifiers in package.json; for example, "github:gulpjs/gulp#4.0" or "git://github.com/user/project.git#commit-ish"

## 3.0.10
Tue, 27 Jun 2017 21:44:50 GMT

### Patches

- Fix an issue with 'rush rebuild' where it fails on non-windows platforms
- Fix an issue with 'rush -help' where it throws if rush.json is not available.

## 3.0.9
Thu, June 8, 2017 03:30:27 GMT

### Patches

- Fix issue with 'rush check' where it sometimes threw exceptions.

## 3.0.8
Thu, June 8, 2017 03:00:27 GMT

### Patches

- Fix issue with 'rush check' so it no longer considers cyclic dependencies as a mismatch.

## 3.0.7
Tue, May 23, 2017 00:55:27 GMT

### Patches

- Fix a regression for packages with an empty script (no-op)

## 3.0.6
Sat, May 20, 2017 00:55:27 GMT

### Patches

- Revert major break with rush build

## 3.0.5
Fri, May 19, 2017 10:55:27 GMT

### Patches

- Fix the Rush build error due to 'SyntaxError: Unexpected token u in JSON at position 0'
- Fix a minor bug where Rush complained about extra directories.

## 3.0.4
Tue, May 17, 2017 01:48:27 GMT

### Patches

- Improved the "rush build" change detection: if any file outside a project folder has changed, rebuild all projects.
- The "rush build" command now stores the command-line options used during a build, and forces a full rebuild if the options have changed.
- Fix for a "rush publish" bug involving command line option quoting.

## 3.0.3
Tue, May 16, 2017 00:43:27 GMT

### Patches

- Fix a regression where "rush install" sometimes failed to install the NPM tool

## 3.0.2
Sun, May 14, 2017 19:22:16 GMT

### Patches

- Fix some minor documentation issues

## 3.0.1
Sun, May 14, 2017 18:30:35 GMT

### Breaking changes

- THIS IS A BREAKING CHANGE - see the web-build-tools news page for migration instructions
- The "rush install" now automatically detects when you need to run "rush generate", and the algorithm has been redesigned so that many package.json updates can skip "rush generate" entirely - hurray!
- Major restructing of common folder; the "temp_modules" folder is no longer tracked by Git
- Greatly simplified .gitignore; all of Rush's temporary files are now under common/temp
- The rush.json file format has been simplified, and auxiliary config files are now consolidated in common/config/rush
- The "packageReviewFile" feature has been overhauled - see wiki documentation on GitHub
- The "rush check" command was renamed to "rush scan", and "rush check-versions" was shortened to "rush check"

### Minor changes

- The change log file format was expanded to support subset publishing (coming soon!)
- More operations now use the AsyncRecycleBin feature
- The "rush link" command now skips if nothing has changed

### Patches

- Numerous small fixes and enhancments

## 2.5.0
Tue, 11 Apr 2017 21:20:58 GMT

### Minor changes

- Deprecate the pinnedVersions field of rush.json in favor of a standalone pinnedVer sions.json

### Patches

- Bump stream-collator to 2.0.0
- Publish: Improve detection of already published package versions
- Publish: Fix a bug where not all project versions get updated for prerelease

## 2.4.0
Thu, 30 Mar 2017 18:25:38 GMT

### Minor changes

- The 'link' action will be automatically ran after 'install' or 'generate'.
- Support adding a suffix during rush generate

### Patches

- Fixing an issue where install was not detecting changes to the shrinkwrap
- Registry should not be hardcoded when auth token is provided

## 2.3.0
Fri, 24 Feb 2017 22:54:16 GMT

### Minor changes

- Minor version

## 2.2.1
Fri, 24 Feb 2017 22:53:18 GMT

*Version update only*

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

