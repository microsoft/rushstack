# Change Log - @microsoft/rush

This log was last generated on Mon, 23 Feb 2026 00:42:39 GMT and should not be manually modified.

## 5.169.3
Mon, 23 Feb 2026 00:42:39 GMT

### Updates

- Fix .npmrc syncing to common/temp incorrectly caching results, which caused pnpm-specific properties like hoist-pattern to be stripped when the same .npmrc was processed with different options.

## 5.169.2
Fri, 20 Feb 2026 00:15:23 GMT

### Updates

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 5.169.1
Thu, 19 Feb 2026 01:30:24 GMT

### Updates

- Add missing README for rush-azure-storage-build-cache-plugin and rush-buildxl-graph-plugin. Filter files from publish for rush-bridge-cache-plugin.
- Fix an issue where files were missing from the published version of `@rushstack/package-extractor`.

## 5.169.0
Thu, 19 Feb 2026 00:05:11 GMT

### Updates

- Sort the `additionalFilesForOperation` property in operation settings entries in projects' `config/rush-project.json` files before computing operation hashes to produce a stable hash for caching.
- Normalize package layout. CommonJS is now under `lib-commonjs` and DTS is now under `lib-dts`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.
- Add a new "omitAppleDoubleFilesFromBuildCache" experiment. When enabled, the Rush build cache will omit macOS AppleDouble metadata files (._*) from cache archives when a companion file exists in the same directory. This prevents platform-specific metadata files from polluting the shared build cache. The exclusion only applies when running on macOS.
- Add a new `dependsOnNodeVersion` setting for operation entries in rush-project.json. When enabled, the Node.js version is included in the build cache hash, ensuring that cached outputs are invalidated when the Node.js version changes. Accepts `true` (alias for `"patch"`), `"major"`, `"minor"`, or `"patch"` to control the granularity of version matching.

## 5.168.0
Thu, 12 Feb 2026 23:01:10 GMT

### Updates

- Add named exports to support named imports to `@rushstack/rush-sdk`.
- Fix `rush change --verify` to ignore version-only changes in package.json files and changes to CHANGELOG.md and CHANGELOG.json files, preventing false positives after `rush version --bump` updates package versions and changelogs.

## 5.167.0
Thu, 05 Feb 2026 00:24:16 GMT

### Updates

- Add support for `rush-pnpm approve-builds` command to persist `globalOnlyBuiltDependencies` in pnpm-config.json
- Filter npm-incompatible properties from .npmrc when npm is used with a configuration intended for pnpm or yarn, to eliminate spurious warnings during package manager installation.
- Fix a longstanding issue where a package.json script could hang on Windows if it accessed STDIN under certain circumstances
- Upgrade tar dependency from 6.2.1 to 7.5.6 to fix security vulnerability GHSA-8qq5-rm4j-mr97

## 5.166.0
Mon, 12 Jan 2026 23:39:06 GMT

### Updates

- Add support for Node 24 and bump the `rush init` template to default to Node 24.
- Remove use of the deprecated `shell: true` option in process spawn operations.

## 5.165.0
Mon, 29 Dec 2025 22:43:14 GMT

### Updates

- Forward the `parameterNamesToIgnore` `<project>/config/rush-project.json` property to child processes via a `RUSHSTACK_CLI_IGNORED_PARAMETER_NAMES` environment variable
- Fix an issue where `rush update` will error complaining that the shrinkwrap file hasn't been updated to support workspaces in a subspace with no projects.
- Fix an issue where packages listed in the `pnpmLockfilePolicies.disallowInsecureSha1.exemptPackageVersions` `common/config/rush/pnpm-config.json` config file are not exempted in PNPM 9.
- Add support for the `globalOnlyBuiltDependencies` PNPM 10.x option to specify an allowlist of packages permitted to run build scripts to `common/config/rush/pnpm-config.json`.
- Upgrade `pnpm-sync-lib` to v0.3.3 for pnpm v10 compatibility
- Change the Git hook file shebangs to use `/usr/bin/env bash` instead of `/bin/bash` for greater platform compatability.

## 5.164.0
Tue, 16 Dec 2025 21:49:00 GMT

### Minor changes

- Hash full shrinkwrap entry to detect sub-dependency resolution changes

### Updates

- Fix an issue where ProjectChangeAnalyzer checked the pnpm-lock.yaml file in the default subspace only, when it should consider all subspaces.
- Log a warning if Git-tracked symbolic links are encountered during repo state analysis.
- Add support for defining pnpm catalog config.

## 5.163.0
Tue, 25 Nov 2025 17:04:05 GMT

### Minor changes

- Added the ability to select projects via path, e.g. `rush build --to path:./my-project` or `rush build --only path:/some/absolute/path`
- Add project-level parameter ignoring to prevent unnecessary cache invalidation. Projects can now use "parameterNamesToIgnore" in "rush-project.json" to exclude custom command-line parameters that don't affect their operations.

### Updates

- Extract CredentialCache API out into "@rushstack/credential-cache". Reference directly in plugins to avoid pulling in all of "@rushstack/rush-sdk" unless necessary.
- Add subspaceName to the output of the `rush list` command

## 5.162.0
Sat, 18 Oct 2025 00:06:36 GMT

### Updates

- Fork npm-check to address npm audit CVE

## 5.161.0
Fri, 17 Oct 2025 23:22:50 GMT

### Updates

- Add an `allowOversubscription` option to the command definitions in `common/config/rush/command-line.json` to prevent running tasks from exceeding concurrency.
- Add support for PNPM's minimumReleaseAge setting to help mitigate supply chain attacks
- Enable prerelease version matching in bridge-package command
- Fix an issue where `rush add --make-consistent ...` may drop the `implicitlyPreferredVersions` and `ensureConsistentVersions` properties from `common/config/rush/common-versions.json`.
- Treat intermittent ignored redis errors as warnings and allow build to continue.

## 5.160.1
Fri, 03 Oct 2025 22:25:25 GMT

### Updates

- Fix an issue with validation of the `pnpm-lock.yaml` `packageExtensionsChecksum` field in pnpm v10.

## 5.160.0
Fri, 03 Oct 2025 20:10:21 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

### Updates

- Bump the default Node and `pnpm` versions in the `rush init` template.
- Fix an issue with validation of the `pnpm-lock.yaml` `packageExtensionsChecksum` field in pnpm v10.
- Fix an issue where the `$schema` property is dropped from `common/config/rush/pnpm-config.json` when running `rush-pnpm patch-commit ...`

## 5.159.0
Fri, 03 Oct 2025 00:50:08 GMT

### Patches

- [rush-azure-storage-build-cache-plugin] Trim access token output in AdoCodespacesAuthCredential

### Updates

- Fix to allow Bridge Cache plugin be installed but not used when build cache disabled; add cache key to terminal logs
- Add `IOperationExecutionResult.problemCollector` API which matches and collects VS Code style problem matchers
- Replace uuid package dependency with Node.js built-in crypto.randomUUID
- [rush-resolver-cache] Ensure that the correct version of rush-lib is loaded when the global version doesn't match the repository version.
- Upgraded `js-yaml` dependency
- Enhance logging for IPC mode by allowing IPC runners to report detailed reasons for rerun, e.g. specific changed files.
- Support aborting execution in phased commands. The CLI allows aborting via the "a" key in watch mode, and it is available to plugin authors for more advanced scenarios.
- [rush-serve-plugin] Support aborting execution via Web Socket. Include information about the dependencies of operations in messages to the client..
- Add a logging message after the 'Trying to find "tar" binary' message when the binary is found.
- Upgrade inquirer to 8.2.7 in rush-lib
- Bump "express" to 4.21.1 to address reported vulnerabilities in 4.20.0.

## 5.158.1
Fri, 29 Aug 2025 00:08:18 GMT

### Updates

- Deduplicate parsing of dependency specifiers.
- Optimize detection of local projects when collecting implicit preferred versions.
- Dedupe shrinkwrap parsing by content hash.
- [resolver-cache] Use shrinkwrap hash to skip resolver cache regeneration.

## 5.158.0
Tue, 26 Aug 2025 23:27:47 GMT

### Updates

- Adds an optional safety check flag to the Bridge Cache plugin write action.
- Fix a bug in "@rushstack/rush-bridge-cache-plugin" where the cache replay did not block the normal execution process and instead was a floating promise.
- [resolver-cache-plugin] Optimize search for nested package.json files with persistent cache file keyed by integrity hash.
- [rush-serve-plugin] Allow the Rush process to exit if the server is the only active handle.
- Fix poor performance scaling during `rush install` when identifying projects in the lockfile that no longer exist.
- [resolver-cache-plugin] Improve performance of scan for nested package.json files in external packages.
- Optimize `setPreferredVersions` in install setup.
- Ensure that `rush version` and `rush publish` preserve all fields in `version-policies-json`.

## 5.157.0
Fri, 25 Jul 2025 01:24:42 GMT

### Updates

- Improve performance for publishing on filtered clones.

## 5.156.0
Wed, 23 Jul 2025 20:56:15 GMT

### Updates

- Include "parallelism" in phased operation execution context. Update "rush-bridge-cache-plugin" to support both cache read and cache write, selectable via command line choice parameter. Fixes an issue that the options schema for "rush-bridge-cache-plugin" was invalid.
- Add support for `RUSH_BUILD_CACHE_OVERRIDE_JSON` environment variable that takes a JSON string with the same format as the `common/config/build-cache.json` file and a `RUSH_BUILD_CACHE_OVERRIDE_JSON_FILE_PATH` environment variable that takes a file path that can be used to override the build cache configuration that is normally provided by that file.
- Add support for setting environment variables via `<repo-root>/.env` and `~/.rush-user/.env` files.
- [azure-storage-build-cache] Update build-cache.json schema to allow the full range of `loginFlow` options supported by the underlying authentication provider. Add `loginFlowFailover` option to customize fallback sequencing.
- Add performance measures around various operations, include performance entries in telemetry payload.
- Do not run afterExecuteOperation if the operation has not actually completed.

## 5.155.1
Fri, 27 Jun 2025 19:57:04 GMT

### Updates

- Fix pnpm-sync caused .modules.yaml ENOENT during install

## 5.155.0
Fri, 13 Jun 2025 16:10:38 GMT

### Updates

- Add support for PNPM v9 to the pnpm-sync feature.

## 5.154.0
Tue, 10 Jun 2025 18:45:59 GMT

### Updates

- Introduce a `@rushstack/rush-bridge-cache-plugin` package that adds a `--set-cache-only` flag to phased commands, which sets the cache entry without performing the operation.
- Update the `CredentialCache` options object to add support for custom cache file paths. This is useful if `CredentialCache` is used outside of Rush.
- PNPMv10 support: SHA256 hashing for dependencies paths lookup
- Add Linux/MacOS support for new 'virtual-store-dir-max-length'

## 5.153.2
Tue, 13 May 2025 20:33:12 GMT

### Updates

- Fix path parsing issue when running rush bridge-package
- Operations that were cobuilt now have the cobuild time correctly reflected across all agents.
- Add `hasUncommittedChanges` to `IInputSnapshot` for use by plugins.

## 5.153.1
Fri, 25 Apr 2025 01:12:48 GMT

### Updates

- Fix an issue with implicit phase expansion when `--include-phase-deps` is not specified.
- Upgrade `rushstack/heft-config-file` to fix an incompatibility with Node 16

## 5.153.0
Thu, 17 Apr 2025 21:59:15 GMT

### Updates

- Update documentation for `extends`
- Bind "q" to gracefully exit the watcher.
- Clarify registry authentication settings in "rush init" template for .npmrc
- Support the `--changed-projects-only` flag in watch mode and allow it to be toggled between iterations.
- Fix telemetry for "--changed-projects-only" when toggled in watch mode.
- (rush-serve-plugin) Support websocket message to enable/disable operations.

## 5.152.0
Tue, 08 Apr 2025 18:41:27 GMT

### Updates

- Add `ChainedCredential` to `AzureAuthenticationBase` to handle auth failover.
- Add support for developer tools credentials to the Azure build cache.
- Add a new CLI flag `--debug-build-cache-ids` to help with root-causing unexpected cache misses.
- Sort all operations lexicographically by name for reporting purposes.
- (EXPERIMENTAL) Add new commands `rush link-package` and `rush bridge-package`

## 5.151.0
Tue, 25 Mar 2025 16:58:46 GMT

### Updates

- Fix an issue where `--include-phase-deps` and watch mode sometimes included operations that were not required
- Fix an issue where build/rebuild can not be defined in a rush plugin command line configuration
- Use `useNodeJSResolver: true` in `Import.resolvePackage` calls.
- Add missing `./package.json` export; revert `useNodeJSResolver: true`.
- (plugin-api) Guaranteed `operation.associatedPhase` and `operation.associatedProject` are not undefined.

## 5.150.0
Thu, 27 Feb 2025 17:41:59 GMT

### Updates

- Add an `--include-phase-deps` switch that expands an unsafe project selection to include its phase dependencies

## 5.149.1
Wed, 19 Feb 2025 18:54:06 GMT

### Updates

- Remove the unused `RushConstants.rushAlertsStateFilename` property.
- Bump `jsonpath-plus` to `~10.3.0`.

## 5.149.0
Wed, 12 Feb 2025 04:07:30 GMT

### Updates

- Prefer `os.availableParallelism()` to `os.cpus().length`.
- Add a new command line parameter `--node-diagnostic-dir=DIR` to phased commands that, when specified, tells all child build processes to write NodeJS diagnostics into `${DIR}/${packageName}/${phaseIdentifier}`. This is useful if `--cpu-prof` or `--heap-prof` are enabled, to avoid polluting workspace folders.
- Add a new phased command hook `createEnvironmentForOperation` that can be used to customize the environment variables passed to individual operation subprocesses. This may be used to, for example, customize `NODE_OPTIONS` to pass `--diagnostic-dir` or other such parameters.
- Allow --timeline option for all phased commands
- Fix support for "ensureConsistentVersions" in common-versions.json when subspaces features is not enabled.
- Fix an issue where the port parameter in `@rushstack/rush-serve-plugin` was allowed to be a string parameter.

## 5.148.0
Fri, 10 Jan 2025 02:36:20 GMT

### Updates

- Add a configuration option to avoid manually configuring decoupledLocalDependencies across subspaces.
- Improve some `rush-sdk` APIs to support future work on GitHub issue #3994
- Fix an issue where MaxListenersExceeded would get thrown when using the HTTP build cache plugin

## 5.147.2
Mon, 06 Jan 2025 21:48:43 GMT

### Updates

- Fix an issue with evaluation of `shouldEnsureConsistentVersions` when the value is not constant across subspaces or variants.
- Fix an issue where the lockfile object has a nullish value causing yaml.dump to report an error.

## 5.147.1
Thu, 26 Dec 2024 23:35:27 GMT

### Updates

- Fix an issue with the `enableSubpathScan` experiment where the set of returned hashes would result in incorrect build cache identifiers when using `--only`.
- When a no-op operation is not in scope, reflect its result as no-op instead of skipped, so that downstream operations can still write to the build cache.
- Allow injected dependencies without enabling subspaces.

## 5.147.0
Thu, 12 Dec 2024 01:37:25 GMT

### Updates

- Add a new experiment flag `enableSubpathScan` that, when invoking phased script commands with project selection parameters, such as `--to` or `--from`, only hashes files that are needed to compute the cache ids for the selected projects.

## 5.146.0
Tue, 10 Dec 2024 21:23:18 GMT

### Updates

- Support fallback syntax in `.npmrc` files if the package manager is PNPM. See https://pnpm.io/npmrc
- Add an `.isPnpm` property to `RushConfiguration` that is set to true if the package manager for the Rush repo is PNPM.
- Support pnpm lockfile v9, which is used by default starting in pnpm v9.

## 5.145.0
Tue, 10 Dec 2024 05:14:11 GMT

### Updates

- Upgrade `@azure/identity` and `@azure/storage-blob`.
- Add support for Node 22.
- Remove the dependency on node-fetch.

## 5.144.1
Mon, 09 Dec 2024 20:32:01 GMT

### Updates

- Bump `jsonpath-plus` to `~10.2.0`.

## 5.144.0
Wed, 04 Dec 2024 19:32:23 GMT

### Updates

- Remove the `node-fetch` dependency from `@rushstack/rush-http-build-cache-plugin`.

## 5.143.0
Wed, 04 Dec 2024 03:07:08 GMT

### Updates

- Remove the `node-fetch` dependency from @rushstack/rush-amazon-s3-build-cache-plugin.
- (BREAKING API CHANGE) Remove the exported `WebClient` API from @rushstack/rush-amazon-s3-build-cache-plugin.

## 5.142.0
Tue, 03 Dec 2024 23:42:22 GMT

### Updates

- Fix an issue where the ability to skip `rush install` may be incorrectly calculated when using the variants feature.
- Add support for an `"extends"` property in the `common/config/rush/pnpm-config.json` and `common/config/subspace/*/pnpm-config.json` files.
- Add warning when the `globalIgnoredOptionalDependencies` property is specified in `common/config/rush/pnpm-config.json` and the repo is configured to use pnpm <9.0.0.

## 5.141.4
Mon, 02 Dec 2024 20:40:41 GMT

### Updates

- Fix an issue where Rush sometimes incorrectly reported "fatal: could not open 'packages/xxx/.rush/temp/shrinkwrap-deps.json' for reading: No such file or directory" when using subspaces

## 5.141.3
Wed, 27 Nov 2024 07:16:50 GMT

### Updates

- Fix an issue where Rush sometimes incorrectly reported "The overrides settings doesn't match the current shrinkwrap" when using subspaces
- Fix an issue where Rush sometimes incorrectly reported "The package extension hash doesn't match the current shrinkwrap." when using subspaces

## 5.141.2
Wed, 27 Nov 2024 03:27:26 GMT

### Updates

- Fix an issue where filtered installs neglected to install dependencies from other subspaces

## 5.141.1
Wed, 20 Nov 2024 00:24:34 GMT

### Updates

- Update schema for build-cache.json to include recent updates to the @rushstack/rush-azure-storage-build-cache-plugin.

## 5.141.0
Tue, 19 Nov 2024 06:38:33 GMT

### Updates

- Adds two new properties to the configuration for `rush-azure-storage-build-cache-plugin`: `loginFlow` selects the flow to use for interactive authentication to Entra ID, and `readRequiresAuthentication` specifies that a SAS token is required for read and therefore expired authentication is always fatal.
- Adds a new `wasExecutedOnThisMachine` property to operation telemetry events, to simplify reporting about cobuilt operations.
- Fix an issue where empty error logs were created for operations that did not write to standard error.
- Fix an issue where incremental building (with LegacySkipPlugin) would not work when no-op operations were present in the process
- Fix lack of "local-only" option for cacheProvider in build-cache.schema.json
- Fix an issue where if an Operation wrote all logs to stdout, then exited with a non-zero exit code, only the non-zero exit code would show up in the summary.

## 5.140.1
Wed, 30 Oct 2024 21:50:51 GMT

### Updates

- Update the `jsonpath-plus` indirect dependency to mitigate CVE-2024-21534.

## 5.140.0
Tue, 22 Oct 2024 23:59:54 GMT

### Updates

- Fix an issue when using `rush deploy` where the `node_modules/.bin` folder symlinks were not created for deployed packages when using the "default" link creation mode
- Add support for the `globalIgnoredOptionalDependencies` field in the `common/config/rush/pnpm-config.json` file to allow specifying optional dependencies that should be ignored by PNPM

## 5.139.0
Thu, 17 Oct 2024 20:37:39 GMT

### Updates

- Allow rush plugins to extend build cache entries by writing additional files to the metadata folder. Expose the metadata folder path to plugins.
- [CACHE BREAK] Alter the computation of build cache IDs to depend on the graph of operations in the build and therefore account for multiple phases, rather than only the declared dependencies. Ensure that `dependsOnEnvVars` and command line parameters that affect upstream phases impact the cache IDs of downstream operations.
- (BREAKING CHANGE) Replace use of `ProjectChangeAnalyzer` in phased command hooks with a new `InputsSnapshot` data structure that is completely synchronous and does not perform any disk operations. Perform all disk operations and state computation prior to executing the build graph.
- Add a new property `enabled` to `Operation` that when set to false, will cause the execution engine to immediately return `OperationStatus.Skipped` instead of invoking the runner. Use this property to disable operations that are not intended to be executed in the current pass, e.g. those that did not contain changes in the most recent watch iteration, or those excluded by `--only`.
- Add an optional property `cacheHashSalt` to `build-cache.json` to allow repository maintainers to globally force a hash change in build cache entries.

## 5.138.0
Thu, 03 Oct 2024 22:31:07 GMT

### Updates

- Changes the behavior of phased commands in watch mode to, when running a phase `_phase:<name>` in all iterations after the first, prefer a script entry named `_phase:<name>:incremental` if such a script exists. The build cache will expect the outputs from the corresponding `_phase:<name>` script (with otherwise the same inputs) to be equivalent when looking for a cache hit.

## 5.137.0
Thu, 03 Oct 2024 19:46:40 GMT

### Patches

- Expose `getChangesByProject` to allow classes that extend ProjectChangeAnalyzer to override file change analysis

## 5.136.1
Thu, 26 Sep 2024 22:59:11 GMT

### Updates

- Fix an issue where the `--variant` parameter was missing from a phased command when the command's `alwaysInstall` property was set to `true`.

## 5.136.0
Thu, 26 Sep 2024 21:48:00 GMT

### Updates

- Bring back the Variants feature that was removed in https://github.com/microsoft/rushstack/pull/4538.
- Bump express dependency to 4.20.0

## 5.135.0
Fri, 20 Sep 2024 20:23:40 GMT

### Updates

- Fix a bug that caused rush-resolver-cache-plugin to crash on Windows.
- Make individual Rush log files available via the rush-serve-plugin server at the relative URL specified by "logServePath" option. Annotate operations sent over the WebSocket with the URLs of their log files.
- Adds a new experiment 'allowCobuildWithoutCache' for cobuilds to allow uncacheable operations to benefit from cobuild orchestration without using the build cache.
- Deprecate the `sharding.shardOperationSettings` property in the project `config/rush-project.json` in favor of an `operationSettings` entry for an operation with a suffix of `:shard`.

## 5.134.0
Fri, 13 Sep 2024 01:02:46 GMT

### Updates

- Always update shrinkwrap when `globalPackageExtensions` in `common/config/rush/pnpm-config.json` has been changed.
- Pass the initialized credentials cache to `AzureAuthenticationBase._getCredentialFromTokenAsync` in `@rushstack/rush-azure-storage-build-cache-plugin`.
- Support the `rush-pnpm patch-remove` command.

## 5.133.4
Sat, 07 Sep 2024 00:18:08 GMT

### Updates

- Mark `AzureAuthenticationBase._credentialCacheId` as protected in `@rushstack/rush-azure-storage-build-cache-plugin`.

## 5.133.3
Thu, 29 Aug 2024 22:49:36 GMT

### Updates

- Fix Windows compatibility for `@rushstack/rush-resolver-cache-plugin`.

## 5.133.2
Wed, 28 Aug 2024 20:46:32 GMT

### Updates

- Fix an issue where running `rush install --resolution-only` followed by `rush install` would not actually install modules.

## 5.133.1
Wed, 28 Aug 2024 18:19:55 GMT

### Updates

- In rush-resolver-cache-plugin, include the base path in the resolver cache file.
- Support `bundledDependencies` in rush-resolver-cache-plugin.

## 5.133.0
Fri, 23 Aug 2024 00:40:08 GMT

### Updates

- Always update shrinkwrap when globalOverrides has been changed
- Add `afterInstall` plugin hook, which runs after any install finishes.
- Add rush.json option "suppressRushIsPublicVersionCheck" to allow suppressing hardcoded calls to the npmjs.org registry.

## 5.132.0
Wed, 21 Aug 2024 16:25:07 GMT

### Updates

- Add a new `rush install-autoinstaller` command that ensures that the specified autoinstaller is installed.
- Emit an error if a `workspace:` specifier is used in a dependency that is listed in `decoupledLocalDependencies`.
- Add support for `--resolution-only` to `rush install` to enforce strict peer dependency resolution.

## 5.131.5
Mon, 19 Aug 2024 20:03:03 GMT

### Updates

- Fix an issue where PreferredVersions are ignored when a project contains an overlapping dependency entry (https://github.com/microsoft/rushstack/issues/3205)

## 5.131.4
Sun, 11 Aug 2024 05:02:05 GMT

### Updates

- Revert a breaking change in Rush 5.131.3 where pnpm patches were moved from `common/pnpm-patches` to `common/config/rush/pnpm-patches`.

## 5.131.3
Sat, 10 Aug 2024 02:27:14 GMT

### Updates

- Fix an issue where `rush-pnpm patch-commit` would not correctly resolve patch files when the subspaces feature is enabled.

## 5.131.2
Thu, 08 Aug 2024 23:38:18 GMT

### Updates

- Include a missing dependency in `@rushstack/rush-sdk`.

## 5.131.1
Thu, 08 Aug 2024 22:08:41 GMT

### Updates

- Fix an issue where rush-sdk can't be bundled by a consuming package.
- Extract LookupByPath to @rushstack/lookup-by-path and load it from there.

## 5.131.0
Fri, 02 Aug 2024 17:26:59 GMT

### Updates

- Improve Rush alerts with a new "rush alert" command and snooze feature

## 5.130.3
Wed, 31 Jul 2024 23:30:13 GMT

### Updates

- Fix an issue where Rush does not detect an outdated lockfile if the `dependenciesMeta` `package.json` field is edited.
- Include CHANGELOG.md in published releases again
- Fix a bug that caused the build cache to close its terminal writer before execution on error.

## 5.130.2
Fri, 19 Jul 2024 03:41:44 GMT

### Updates

- Fix an issue where `rush-pnpm patch-commit` did not work correctly when subspaces are enabled.

## 5.130.1
Wed, 17 Jul 2024 07:37:13 GMT

### Updates

- Fix a recent regression for `rush init`

## 5.130.0
Wed, 17 Jul 2024 06:55:27 GMT

### Updates

- (EXPERIMENTAL) Initial implementation of Rush alerts feature
- Adjusts how cobuilt operations are added and requeued to the operation graph. Removes the 'RemoteExecuting' status.

## 5.129.7
Tue, 16 Jul 2024 04:16:56 GMT

### Updates

- Upgrade pnpm-sync-lib to fix an edge case when handling node_modules folder
- Don't interrupt the installation process if the user hasn't enabled the inject dependencies feature.
- Improve `@rushtack/rush-sdk` and make it reuse `@microsoft/rush-lib` from rush global folder
- Remove the trailing slash in the `.DS_Store/` line in the `.gitignore` file generated by `rush init`. `.DS_Store` is a file, not a folder.
- Support deep references to internal Apis
- Fix an issue where `rush add` would ignore the `ensureConsistentVersions` option if that option was set in `rush.json` instead of in `common/config/rush/common-versions.json`.
- Fix an issue where running `rush add` in a project can generate a `package.json` file that uses JSON5 syntax. Package managers expect strict JSON.
- fix spelling of "committing" in rush.json init template and schema

## 5.129.6
Thu, 27 Jun 2024 00:44:32 GMT

### Updates

- Fix an edge case for workspace peer dependencies when calculating packageJsonInjectedDependenciesHash to improve its accuracy 
- Update a URL in the `.pnpmfile.cjs` generated by `rush init`.

## 5.129.5
Tue, 25 Jun 2024 20:13:29 GMT

### Updates

- Don't include package.json version field when calculating packageJsonInjectedDependenciesHash

## 5.129.4
Mon, 24 Jun 2024 23:49:10 GMT

### Updates

- Normalize the file permissions (644) for Rush plugin files that are committed to Git

## 5.129.3
Fri, 21 Jun 2024 00:15:54 GMT

### Updates

- Fixed an issue where DependencyAnalyzer caches the same analysis for all subspaces

## 5.129.2
Wed, 19 Jun 2024 23:59:09 GMT

### Updates

- Fix an issue where the `rush pnpm ...` command always terminates with an exit code of 1.

## 5.129.1
Wed, 19 Jun 2024 04:20:03 GMT

### Updates

- Add logic to remove outdated .pnpm-sync.json files during rush install or update

## 5.129.0
Wed, 19 Jun 2024 03:31:48 GMT

### Updates

- Add a new `init-subspace` command to initialize a new subspace.
- Move the `ensureConsistentVersions` setting from `rush.json` to `common/config/rush/common-versions.json`, or to `common/config/rush/<subspace>/common-versions.json` if subspaces are enabled.

## 5.128.5
Tue, 18 Jun 2024 04:02:54 GMT

### Updates

- Fix a key collision for cobuild clustering for operations that share the same phase name.

## 5.128.4
Mon, 17 Jun 2024 23:22:49 GMT

### Updates

- Bump the `@azure/identity` package to `~4.2.1` to mitigate GHSA-m5vv-6r4h-3vj9.

## 5.128.3
Mon, 17 Jun 2024 20:46:21 GMT

### Updates

- Fixed an issue where the --make-consistent flag would affect projects outside the current subspace.

## 5.128.2
Mon, 17 Jun 2024 17:08:00 GMT

### Updates

- Fix an issue where rush-pnpm patch is not working for the subspace scenario
- Fix an issue where rush update can not detect package.json changes in other subspaces for the injected installation case

## 5.128.1
Wed, 12 Jun 2024 20:07:44 GMT

### Updates

- Fix an issue where running `rush install` in a subspace with only a `--from` selector is treated as selecting all projects.
- Fix an issue where not published packages are not correctly identified as not published when querying a package feed under certain versions of NPM.
- Fix an issue where selection syntax (like `--to` or `--from`) misses project dependencies declared using workspace alias syntax (i.e. - `workspace:alias@1.2.3`).
- Fix an issue where an error is thrown if a Git email address isn't configured and email validation isn't configured in `rush.json` via `allowedEmailRegExps`.
- Display the name of the subspace when an error is emitted because a dependency hash uses the SHA1 algorithm and the "disallowInsecureSha1" option is enabled.

## 5.128.0
Fri, 07 Jun 2024 22:59:12 GMT

### Updates

- Graduate the `phasedCommands` experiment to a standard feature.
- Improve `rush init` template for `.gitignore`
- Remove an unnecessary condition in the logic for skipping operations when build cache is disabled.

## 5.127.1
Thu, 06 Jun 2024 03:05:21 GMT

### Updates

- Remove the second instance of the project name from the project operation filenames in `<projectFolder>/rush-logs`. This restores the log filenames to their format before Rush 5.125.0.

## 5.127.0
Tue, 04 Jun 2024 00:44:18 GMT

### Updates

- Fixes build cache no-op and sharded operation clustering.
- Updated common-veresions.json schema with ensureConsistentVersions property

## 5.126.0
Mon, 03 Jun 2024 02:49:05 GMT

### Updates

- Fixes a string schema validation warning message when running `rush deploy`.
- Update the functionality that runs external lifecycle processes to be async.
- Move logs into the project `rush-logs` folder regardless of whether or not the `"phasedCommands"` experiment is enabled.
- Update the `nodeSupportedVersionRange` in the `rush init` template to the LTS and current Node versions.
- Update the `pnpmVersion` in the `rush init` template to the latest version of pnpm 8.
- Update the `.gitignore` in the `rush init` template to include some common toolchain output files and folders.
- Include missing `type` modifiers on type-only exports.

## 5.125.1
Wed, 29 May 2024 05:39:54 GMT

### Updates

- Fix an issue where if `missingScriptBehavior` is set to `"error"` and a script is present and empty, an error would be thrown.

## 5.125.0
Sat, 25 May 2024 05:12:20 GMT

### Updates

- Fixes a bug where no-op operations were treated as having build cache disabled.
- Adds support for sharding operations during task execution.
- Fix an issue where warnings and errors were not shown in the build summary for all cobuild agents.
- Add a `rush check --subspace` parameter to specify which subspace to analyze
- Rename the subspace level lockfile from `.pnpmfile-subspace.cjs` to `.pnpmfile.cjs`. This is a breaking change for the experimental feature.

## 5.124.7
Thu, 23 May 2024 02:27:13 GMT

### Updates

- Improve the `usePnpmSyncForInjectedDependencies` experiment to also include any dependency whose lockfile entry has the `file:` protocol, unless it is a tarball reference
- Fix an issue where the build cache analysis was incorrect in rare situations due to a race condition (GitHub #4711)

## 5.124.6
Thu, 16 May 2024 01:12:22 GMT

### Updates

- Fix an edge case for pnpm-sync when the .pnpm folder is absent but still a valid installation.

## 5.124.5
Wed, 15 May 2024 23:43:15 GMT

### Updates

- Fix count of completed operations when silent operations are blocked. Add explicit message for child processes terminated by signals. Ensure that errors show up in summarized view.
- Ensure that errors thrown in afterExecuteOperation show up in the summary at the end of the build.

## 5.124.4
Wed, 15 May 2024 03:05:57 GMT

### Updates

- Improve the detection of PNPM lockfile versions.
- Fix an issue where the `--subspace` CLI parameter would install for all subspaces in a monorepo when passed to the install or update action

## 5.124.3
Wed, 15 May 2024 01:18:25 GMT

### Patches

- Ensure async telemetry tasks are flushed by error reporter

### Updates

- Fix an issue where `rush install` and `rush update` will fail with an `ENAMETOOLONG` error on Windows in repos with a large number of projects.
- Fix an issue where installing multiple subspaces consecutively can cause unexpected cross-contamination between pnpmfiles.

## 5.124.2
Fri, 10 May 2024 06:35:26 GMT

### Updates

- Fix a recent regression where `rush deploy` did not correctly apply the `additionalProjectsToInclude` setting (GitHub #4683)

## 5.124.1
Fri, 10 May 2024 05:33:51 GMT

### Updates

- Fix an issue where the `disallowInsecureSha1` policy failed to parse certain lockfile entries
- Fix some minor issues with the "rush init" template files
- Report an error if subspacesFeatureEnabled=true without useWorkspaces=true
- Fix an issue where operation weights were not respected.

## 5.124.0
Wed, 08 May 2024 22:24:08 GMT

### Updates

- Add a new setting `alwaysInjectDependenciesFromOtherSubspaces` in pnpm-config.json
- Fix a issue where rush install/update can not detect pnpm-sync.json is out of date
- Improve the error message when the pnpm-sync version is outdated
- Fixes a bug where cobuilds would cause a GC error when waiting for long periods of time.
- Fix an issue where tab competions did not suggest parameter values.

## 5.123.1
Tue, 07 May 2024 22:38:00 GMT

### Updates

- Fix a recent regression where "rush install" would sometimes incorrectly determine whether to skip the install

## 5.123.0
Tue, 07 May 2024 18:32:36 GMT

### Updates

- Provide the file path if there is an error parsing a `package.json` file.
- Timeline view will now only show terminal build statuses as cobuilt, all other statuses will reflect their original icons.
- Add a `"weight"` property to the `"operation"` object in the project `config/rush-project.json` file that defines an integer weight for how much of the allowed parallelism the operation uses.
- Optimize skipping of unnecessary installs when using filters such as "rush install --to x"

## 5.122.1
Tue, 30 Apr 2024 23:36:50 GMT

### Updates

- Make `disallowInsecureSha1` policy a subspace-level configuration.
- Fix an issue where `rush update` sometimes did not detect changes to pnpm-config.json

## 5.122.0
Thu, 25 Apr 2024 07:33:18 GMT

### Updates

- Support rush-pnpm for subspace feature
- Skip determining merge base if given git hash
- (BREAKING CHANGE) Improve the `disallowInsecureSha1` policy to support exemptions for certain package versions. This is a breaking change for the `disallowInsecureSha1` field in pnpm-config.json since Rush 5.119.0.

## 5.121.0
Mon, 22 Apr 2024 19:11:26 GMT

### Updates

- Add support for auth via microsoft/ado-codespaces-auth vscode extension in `@rushstack/rush-azure-storage-build-cache-plugin`

## 5.120.6
Thu, 18 Apr 2024 23:20:02 GMT

### Updates

- Fix an issue where "rush deploy" did not correctly deploy build outputs combining multiple Rush subspaces

## 5.120.5
Wed, 17 Apr 2024 21:58:17 GMT

### Updates

- Fix an issue where rush add affects all packages in a subspace

## 5.120.4
Tue, 16 Apr 2024 20:04:25 GMT

### Updates

- Fix an issue where `rush deploy` sometimes used an incorrect temp folder when the experimental subspaces feature is enabled

## 5.120.3
Tue, 16 Apr 2024 02:59:48 GMT

### Updates

- Fix an issue where `pnpm-sync copy` was skipped when a build is restored from build cache.
- Upgrade `tar` dependency to 6.2.1

## 5.120.2
Mon, 15 Apr 2024 00:25:04 GMT

### Updates

- Fixes an issue where rush install fails in monorepos with subspaces enabled

## 5.120.1
Sat, 13 Apr 2024 18:31:00 GMT

### Updates

- Fix an issue where install-run-rush.js sometimes incorrectly invoked .cmd files on Windows OS due to a recent Node.js behavior change.
- Fix an issue with the skip install logic when the experimental subspaces feature is enabled

## 5.120.0
Wed, 10 Apr 2024 21:59:57 GMT

### Updates

- Bump express.
- Add support for `optionalDependencies` in transitive injected install in the Subspaces feature.
- Update dependency: pnpm-sync-lib@0.2.2
- Remove a restriction where the repo root would not be found if the CWD is >10 directory levels deep.
- Improve the error message that is printed in a repo using PNPM workspaces when a non-`workspace:` version is used for a project inside the repo.
- Include a missing space in a logging message printed when running `rush add`.
- Clarify the copyright notice emitted in common/scripts/*.js
- Fix an issue with loading of implicitly preferred versions when the experimental subspaces feature is enabled

## 5.119.0
Sat, 30 Mar 2024 04:32:31 GMT

### Updates

- Add a policy to forbid sha1 hashes in pnpm-lock.yaml.
- (BREAKING API CHANGE) Refactor phased action execution to analyze the repo after the initial operations are created. This removes the `projectChangeAnalyzer` property from the context parameter passed to the `createOperations` hook.

## 5.118.7
Thu, 28 Mar 2024 19:55:27 GMT

### Updates

- Fix an issue where in the previous release, built-in plugins were not included.

## 5.118.6
Wed, 27 Mar 2024 05:31:17 GMT

### Updates

- Symlinks are now generated for workspace projects in the temp folder when subspaces and splitWorkspaceCompatibility is enabled.

## 5.118.5
Tue, 26 Mar 2024 19:58:40 GMT

### Updates

- Use pnpm-sync-lib logging APIs to customize the log message for pnpm-sync operations

## 5.118.4
Tue, 26 Mar 2024 02:39:06 GMT

### Updates

- Added warnings if there are .npmrc or .pnpmfile.cjs files in project folders after migrating to subspaces

## 5.118.3
Sat, 23 Mar 2024 01:41:10 GMT

### Updates

- Fix an edge case for computing the PNPM store path when the experimental subspaces feature is enabled

## 5.118.2
Fri, 22 Mar 2024 17:30:47 GMT

### Updates

- Fix bugs related to path operation in Windows OS for subspace feature

## 5.118.1
Thu, 21 Mar 2024 16:39:32 GMT

### Updates

- Support PNPM injected installation in Rush subspace feature

## 5.118.0
Wed, 20 Mar 2024 20:45:18 GMT

### Updates

- (BREAKING API CHANGE) Rename `AzureAuthenticationBase._getCredentialFromDeviceCodeAsync` to `AzureAuthenticationBase._getCredentialFromTokenAsync` in `@rushstack/rush-azure-storage-build-cache-plugin`. Adding support for InteractiveBrowserCredential.

## 5.117.10
Wed, 20 Mar 2024 04:57:57 GMT

### Updates

- Improve the "splitWorkspaceCompatibility" setting to simulate hoisted dependencies when the experimental Rush subspaces feature is enabled

## 5.117.9
Tue, 12 Mar 2024 19:15:07 GMT

### Updates

- Add functionality to disable filtered installs for specific subspaces

## 5.117.8
Sat, 09 Mar 2024 01:11:16 GMT

### Updates

- Fixes a bug where the syncNpmrc function incorrectly uses the folder instead of the path

## 5.117.7
Fri, 08 Mar 2024 23:45:24 GMT

### Updates

- Fix an issue where, when the experimental subspace feature is enabled, the subspace's ".npmrc" file did not take precedence over ".npmrc-global".

## 5.117.6
Thu, 07 Mar 2024 19:35:20 GMT

### Updates

- Fixes an issue where cobuilds would write success with warnings as successful cache entries.

## 5.117.5
Wed, 06 Mar 2024 23:03:27 GMT

### Updates

- Add filtered installs for subspaces

## 5.117.4
Tue, 05 Mar 2024 21:15:26 GMT

### Updates

- Add support for subspace level scoped pnpm-config.json e.g. `common/config/subspaces/default/pnpm-config.json`

## 5.117.3
Tue, 05 Mar 2024 01:19:42 GMT

### Updates

- Fix an issue where if a patch is removed from `common/pnpm-patches` after `rush install` had already been run with that patch present, pnpm would try to continue applying the patch.
- Intercept the output printed by `rush-pnpm patch` to update the next step's instructions to run `rush-pnpm patch-commit ...` instead of `pnpm patch-commit ...`.

## 5.117.2
Fri, 01 Mar 2024 23:12:43 GMT

### Updates

- Fix an issue with the experimental subspaces feature, where version checks incorrectly scanned irrelevant subspaces.

## 5.117.1
Thu, 29 Feb 2024 07:34:31 GMT

### Updates

- Update "rush init" template to document the new build-cache.json constants
- Remove trailing slashes from `node_modules` and `jspm_packages` paths in the `.gitignore` file generated by `rush init`.
- Introduce a `RushCommandLine` API that exposes an object representing the skeleton of the Rush command-line.
- Fix an issue where, when the experimental subspaces feature was enabled, the lockfile validation would check irrelevant subspaces

## 5.117.0
Mon, 26 Feb 2024 21:39:36 GMT

### Updates

- Include the ability to add `[os]` and `[arch]` tokens to cache entry name patterns.
- (BREAKING CHANGE) Remove the 'installation variants' feature and its related APIs, which have been superceded by the Subspaces feature.
- Extract the "rush.json" filename to a constant as `RushConstants.rushJsonFilename`.

## 5.116.0
Mon, 26 Feb 2024 20:04:02 GMT

### Updates

- Upgrade the `pnpm-sync-lib` dependency version.
- Handle `workspace:~` and `workspace:^` wildcard specifiers when publishing. They remain as-is in package.json but get converted to `~${current}` and `^${current}` in changelogs.
- Validate that the "projectFolder" and "publishFolder" fields in the "projects" list in "rush.json" are normalized POSIX relative paths that do not end in trailing "/" or contain "\\".

## 5.115.0
Thu, 22 Feb 2024 01:36:27 GMT

### Updates

- Add a "runWithTerminalAsync" resource lifetime helper to `IOperationRunnerContext` to manage the creation and cleanup of logging for operation execution.
- Adds a new experiment `useIPCScriptsInWatchMode`. When this flag is enabled and Rush is running in watch mode, it will check for npm scripts named `_phase:<phase-name>:ipc`, and if found, use them instead of the normal invocation of `_phase:<phase-name>`. When doing so, it will provide an IPC channel to the child process and expect the child to outlive the current build pass.

## 5.114.3
Thu, 22 Feb 2024 00:10:32 GMT

### Updates

- Replace deprecated function, and fix a path bug in Windows env

## 5.114.2
Wed, 21 Feb 2024 21:45:46 GMT

### Updates

- Replace the dependency on the `colors` package with `Colorize` from `@rushstack/terminal`.

## 5.114.1
Wed, 21 Feb 2024 08:56:05 GMT

### Updates

- Improve `rush scan` to analyze APIs such as `Import.lazy()` and `await import()`
- Fix a recent regression where `@rushstack/rush-sdk` did not declare its dependency on `@rushstack/terminal`

## 5.114.0
Mon, 19 Feb 2024 21:54:44 GMT

### Updates

- (EXPERIMENTAL) Add `enablePnpmSyncForInjectedDependenciesMeta` to experiments.json; it is part of an upcoming feature for managing PNPM "injected" dependencies: https://www.npmjs.com/package/pnpm-sync
- Include a `pnpmPatchesCommonFolderName` constant for the folder name "pnpm-patches" that gets placed under "common".
- Add a feature to generate a `project-impact-graph.yaml` file in the repo root. This feature is gated under the new `generateProjectImpactGraphDuringRushUpdate` experiment.
- Fix a formatting issue with the LICENSE.
- Fix an issue with filtered installs when the experimental subspaces feature is enabled

## 5.113.4
Wed, 31 Jan 2024 22:49:17 GMT

### Updates

- Introduce an explicit warning message during `rush install` or `rush update` about `dependenciesMeta` not being up-to-date.

## 5.113.3
Wed, 31 Jan 2024 22:25:55 GMT

### Updates

- Fix an issue where `rush update` would sometimes not correctly sync the `pnpm-lock.yaml` file back to `common/config/rush/` after a project's `package.json` has been updated.

## 5.113.2
Wed, 31 Jan 2024 18:45:33 GMT

### Updates

- Fix some minor issues when the experimental subspaces feature is enabled

## 5.113.1
Wed, 31 Jan 2024 07:07:50 GMT

### Updates

- (EXPERIMENTAL) Enable filtered installs of subspaces and add a "preventSelectingAllSubspaces" setting

## 5.113.0
Tue, 30 Jan 2024 22:58:52 GMT

### Updates

- Fix an issue where Rush does not detect changes to the `dependenciesMeta` field in project's `package.json` files, so may incorrectly skip updating/installation.
- Add ability to enable IPC channels in `Utilities#executeLifeCycleCommand`.
- Update `rush init` template to document the "buildSkipWithAllowWarningsInSuccessfulBuild" experiment
- (BREAKING CHANGE) Begin removal of APIs for the deprecated "installation variants" feature, since subspaces are a more robust solution for that problem
- (EXPERIMENTAL) Implement installation for the not-yet-released "subspaces" feature (GitHub #4230)

## 5.112.2
Tue, 12 Dec 2023 00:20:51 GMT

### Updates

- Bring back the erroneously removed `preminor` bump type for lockstepped packages.
- Fix an issue where the contents of a folder set in the `"folderToCopy"` field of the `deploy.json` config file would be copied into a subfolder instead of into the root of the deploy folder.
- (EXPERIMENTAL) Implemented config file loader for the not-yet-released "subspaces" feature (GitHub #4230)

## 5.112.1
Wed, 29 Nov 2023 08:59:31 GMT

### Updates

- Allow the device code credential options to be extended Azure authentication subclasses, used in advanced authentication scenarios.

## 5.112.0
Mon, 27 Nov 2023 23:36:11 GMT

### Updates

- Update the `@azure/identity` and `@azure/storage-blob` dependencies of `@rushstack/rush-azure-storage-build-cache-plugin` to eliminate an `EBADENGINE` error when installing Rush on Node 20.

## 5.111.0
Sat, 18 Nov 2023 00:06:20 GMT

### Updates

- Add experiment `buildSkipWithAllowWarningsInSuccessfulBuild` to allow skipping builds that succeeded with warnings in the previous run.

## 5.110.2
Thu, 16 Nov 2023 01:36:10 GMT

_Version update only_

## 5.110.1
Wed, 01 Nov 2023 23:29:47 GMT

### Updates

- Fix line endings in published package.

## 5.110.0
Mon, 30 Oct 2023 23:37:07 GMT

### Updates

- Include the filename of the shrinkwrap file in logging messages for all package managers, not just Yarn.
- performance improvements by running asynchronous code concurrently using Promise.all

## 5.109.2
Fri, 20 Oct 2023 01:54:21 GMT

### Updates

- Allow the output preservation incremental strategy if the build cache is configured but disabled. When running in verbose mode, log the incremental strategy that is being used.
- Log the cache key in `--verbose` mode when the cache is successfully read from or written to.
- Fix an issue where console colors were sometimes not enabled correctly during `rush install`
- Fix an issue where running `rush update-cloud-credentials --interactive` sometimes used the wrong working directory when invoked in a repo configured to use the `http` build cache provider (GitHub #4396)

## 5.109.1
Sat, 07 Oct 2023 01:20:56 GMT

### Updates

- Fix incorrect capitalization in the "rush init" template

## 5.109.0
Sat, 07 Oct 2023 00:25:27 GMT

### Updates

- (IMPORTANT) Add a new setting `autoInstallPeers` in pnpm-config.json; be aware that Rush changes PNPM's default if you are using PNPM 8 or newer
- (IMPORTANT) After upgrading, if `rush install` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, please run `rush update --recheck`
- Improve visual formatting of custom tips
- Add start `preRushx` and `postRushx` event hooks for monitoring the `rushx` command
- Update the oldest usable Node.js version to 14.18.0, since 14.17.0 fails to load

## 5.108.0
Mon, 02 Oct 2023 20:23:27 GMT

### Updates

- Fix an issue where `rush purge` fails on Linux and Mac if the `common/temp/rush-recycler` folder does not exist.
- Add "--offline" parameter for "rush install" and "rush update"
- Ignore pause/resume watcher actions when the process is not TTY mode

## 5.107.4
Tue, 26 Sep 2023 21:02:52 GMT

### Updates

- Update type-only imports to include the type modifier.
- Make the project watcher status and keyboard commands message more visible.

## 5.107.3
Fri, 22 Sep 2023 09:01:38 GMT

### Updates

- Fix filtered installs in pnpm@8.

## 5.107.2
Fri, 22 Sep 2023 00:06:12 GMT

### Updates

- Fix a bug in which an operation failing incorrectly does not block its consumers.
- Add `resolutionMode` to `rush init` template for pnpm-config.json

## 5.107.1
Tue, 19 Sep 2023 21:13:23 GMT

### Updates

- Fix pnpm's install status printing when pnpm custom tips are defined.

## 5.107.0
Tue, 19 Sep 2023 00:36:50 GMT

### Updates

- Update @types/node from 14 to 18
- Remove previously removed fields from the `custom-tips.json` schema.
- (BREAKING API CHANGE) Refactor the `CustomTipsConfiguration` by removing the `configuration` property and adding a `providedCustomTipsByTipId` map property.
- Fix an issue where pnpm would would not rewrite the current status line on a TTY console, and instead would print a series of separate status lines during installation. Note that this is only fixed when there are no custom PNPM tips provided.
- Add "Waiting" operation status for operations that have one or more dependencies still pending. Ensure that the `onOperationStatusChanged` hook fires for every status change.
- Add support for optional build status notifications over a web socket connection to `@rushstack/rush-serve-plugin`.
- Add pause/resume option to project watcher

## 5.106.0
Thu, 14 Sep 2023 09:20:11 GMT

### Updates

- (IMPORTANT) Add a new setting `resolutionMode` in pnpm-config.json; be aware that Rush now overrides the default behavior if you are using PNPM 8.0.0 through 8.6.12 (GitHub #4283)
- Support adding custom tips for pnpm-printed logs
- (BREAKING CHANGE) Remove the "defaultMessagePrefix" config in custom-tips.json
- Rename the `PnpmStoreOptions` type to `PnpmStoreLocation`.

## 5.105.0
Fri, 08 Sep 2023 04:09:06 GMT

### Updates

- Disable build cache writes in watch rebuilds.
- Fix the instance of "ICreateOperationsContext" passed to the "beforeExecuteOperations" hook in watch mode rebuilds to match the instance passed to the "createOperations" hook.
- Fix an issue where the error message printed when two phases have overlapping output folders did not mention both phases.
- Update the phase output folders validation to only check for overlapping folders for phases that actually execute an operation in a given project.
- Add the "disableBuildCache" option to the schema for phased commands (it is already present for bulk commands). Update the behavior of the "disableBuildCache" flag to also disable the legacy skip detection, in the event that the build cache is not configured.

## 5.104.1
Tue, 05 Sep 2023 18:53:03 GMT

### Updates

- Fix an issue where `rush init` generated a `cobuild.json` file that reported errors (GitHub #4307)

## 5.104.0
Fri, 01 Sep 2023 04:54:16 GMT

### Updates

- (EXPERIMENTAL) Initial release of the cobuild feature, a cheap way to distribute jobs Rush builds across multiple VMs. (GitHub #3485)

## 5.103.0
Thu, 31 Aug 2023 23:28:28 GMT

### Updates

- Add dependencySettings field to Rush deploy.json configurations. This will allow developers to customize how third party dependencies are processed when running `rush deploy`
- Fix an issue where `rush update-autoinstaller` sometimes did not fully upgrade the lockfile
- Fix an issue where "undefined" was sometimes printed instead of a blank line

## 5.102.0
Tue, 15 Aug 2023 20:09:40 GMT

### Updates

- Add a new config file "custom-tips.json" for customizing Rush messages (GitHub #4207)
- Improve "rush scan" to recognize module patterns such as "import get from 'lodash.get'"
- Update Node.js version checks to support the new LTS release
- Update "rush init" template to use PNPM 7.33.5
- Update the "rush init" template's .gitignore to avoid spurious diffs for files such as "autoinstaller.lock"
- Fix an issue where a pnpm-lock file would fail to parse if a project used a package alias in a repo using pnpm 8.
- Fix HTTP/1 backwards compatibility in rush-serve-plugin.
- Add experiment "usePnpmLockfileOnlyThenFrozenLockfileForRushUpdate" that, when running `rush update`, performs first a `--lockfile-only` update to the lockfile, then a `--frozen-lockfile` installation. This mitigates issues that may arise when using the `afterAllResolved` hook in `.pnpmfile.cjs`.

## 5.101.1
Fri, 11 Aug 2023 17:57:55 GMT

### Updates

- Fix a regression from 5.101.0 where publishing features did not detect changes properly when running on  Windows OS (GitHub #4277)
- Add support in rush-serve-plugin for HTTP/2, gzip compression, and CORS preflight requests.

## 5.101.0
Tue, 08 Aug 2023 07:11:02 GMT

### Updates

- Enable the "http" option for build-cache providers
- Switch from glob to fast-glob.
- Reduce false positive detections of the pnpm shrinkwrap file being out of date in the presence of the `globalOverrides` setting in `pnpm-config.json`, or when a dependency is listed in both `dependencies` and `devDependencies` in the same package.
- @rushstack/rush-sdk now exposes a secondary API for manually loading the Rush engine and monitoring installation progress
- Add support for npm aliases in `PnpmShrinkwrapFile._getPackageId`.
- Improve version resolution logic in common/scripts/install-run.js (see https://github.com/microsoft/rushstack/issues/4256)
- Add `patternsToInclude` and `patternsToExclude` support to Rush deploy.json configurations. This will allow developers to include or exclude provided glob patterns within a local project when running `rush deploy`.

## 5.100.2
Mon, 24 Jul 2023 18:54:49 GMT

### Patches

- Fix an issue where the git pre-push hook would allow push to go through if the script exited with error.

### Updates

- Updated semver dependency

## 5.100.1
Wed, 14 Jun 2023 19:42:12 GMT

### Updates

- Fix an issue where Rush would attempt to open a project's log file for writing twice.
- Fix an issue where arguments weren't passed to git hook scripts.

## 5.100.0
Tue, 13 Jun 2023 01:49:21 GMT

### Updates

- (BREAKING API CHANGE) Remove unused members of the `BumpType` API. See https://github.com/microsoft/rushstack/issues/1335 for details.
- Add `--peer` flag to `rush add` command to add peerDependencies
- Add support for PNPM 8.
- Remove the dependency on `lodash`.
- Add functionality for the Amazon S3 Build Cache Plugin to read credentials from common AWS_* environment variables.
- Write cache logs to their own file(s).
- Fix an issue where cache logging data was always written to stdout.
- Generate scripts in the Git hooks folder referring to the actual hook implementations in-place in the Rush `common/git-hooks/` folder instead of copying the scripts to the Git hooks folder.
- Bump webpack to v5.82.1

## 5.99.0
Fri, 02 Jun 2023 22:08:28 GMT

### Updates

- Use a separate temrinal for logging cache subsystem
- Expose beforeLog hook
- Convert to multi-phase Heft
- Use `JSON.parse` instead of `jju` to parse `package.json` files for faster performance.

## 5.98.0
Sun, 21 May 2023 00:18:35 GMT

### Updates

- Add a "forbidPhantomResolvableNodeModuleFolders" experiment that forbids node_modules folders in the repo root and in parent folders.
- Update the `RushSession.registerCloudBuildCacheProviderFactory` API to allow a cache provider's factory function to return a promise.
- Add built-in plugin rush-http-build-cache-plugin
- Fix an issue where the last character in a project's path is ignored when determining which files contribute to the project's cache ID.
- Fix a performance bug in `rush version` when using `workspace:` protocol.
- (BREAKING API CHANGE) Add a property `missingScriptBehavior` to phase definitions that can be used to silence missing scripts to reduce log noise. This replaces the `ignoreMissingScript` property visible to the plugin API, although the `ignoreMissingScript` property is still supported in the `common/config/rush/command-line.json` config file for backwards compatibility.
- Flatten watch status into a single line with TTY rewrites.

## 5.97.1
Tue, 18 Apr 2023 16:39:03 GMT

### Updates

- `rush version` will now respect the `ensureConsistentVersions` field in `rush.json`
- Bump webpack to 5.78.0
- Fix file watching on Windows in the presence of Git's fsmonitor by not watching the .git folder.

## 5.97.0
Wed, 05 Apr 2023 21:46:37 GMT

### Updates

- Convert the `EnvironmentVariableNames` from an enum to a const so that its values can be referred to by type.

## 5.96.0
Fri, 31 Mar 2023 00:27:51 GMT

### Updates

- Fix an issue where rush-sdk sometimes failed to load if the globally installed Rush version was older than rushVersion in rush.json (GitHub #4039)
- Modify the scheduling behavior of phased commands to schedule only the expressly enumerated phases in all selected projects, adding additional phases only where needed to satisfy dependencies.

## 5.95.0
Fri, 24 Mar 2023 08:53:43 GMT

### Updates

- Add experiment `printEventHooksOutputToConsole` to allow printing outputs from event hooks to the console.

## 5.94.1
Wed, 22 Mar 2023 20:48:48 GMT

### Updates

- Fix an issue where rush plugin autoinstallers would fail to install because the Rush global folder had not yet been initialized.
- Fix an issue with `rush update-autoinstaller` where it may fail with an `Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with package.json` error.

## 5.94.0
Mon, 20 Mar 2023 20:14:36 GMT

### Updates

- Update the `nodeSupportedVersionRange` in `rush.json` generated by `rush init` to remove Node 12 as it is no longer supported and include Node 18 as it is the current LTS version.
- Extend LookupByPath to also be able to obtain the index of the remainder of the matched path.
- Include some more hooks to allow plugins to monitor phased command execution in real-time.
- Fix an issue where running `rush update-autoinstaller` without having run `rush install` or `rush update` first would cause a crash with an unhelpful error message.

## 5.93.2
Mon, 06 Mar 2023 20:18:01 GMT

### Updates

- Do not delete the local pnpm store after all install attempts has failed. `rush purge` will still delete a local store.

## 5.93.1
Fri, 17 Feb 2023 14:46:59 GMT

### Updates

- Fix a regression where "rush-sdk" failed to load older versions of "rush-lib" (GitHub #3979)

## 5.93.0
Fri, 17 Feb 2023 02:14:43 GMT

### Updates

- Add code path to @rushstack/rush-sdk for inheriting @microsoft/rush-lib location from a parent process via the _RUSH_LIB_PATH environment variable.

## 5.92.0
Sun, 12 Feb 2023 02:50:42 GMT

### Updates

- Enable @rushstack/rush-sdk to import internal APIs from the proxied @microsoft/rush-lib instance (GitHub #3895)

## 5.91.0
Sat, 11 Feb 2023 02:04:14 GMT

### Updates

- Remove runtime dependency on @rushstack/rush-sdk from the AzureStorageAuthentication class in @rushstack/rush-azure-storage-build-cache-plugin so that it can be used in isolation.
- Include operation log files in the cache, and restore them during cache hits.

## 5.90.2
Wed, 08 Feb 2023 20:27:06 GMT

_Version update only_

## 5.90.1
Wed, 08 Feb 2023 19:58:35 GMT

### Patches

- Fix determination of the root of the current Git worktree when in a multi-worktree setup.

### Updates

- Disable unused depcheck feature for upgrade-interactive.
- Fix an issue where deleting the `common/temp/node_modules` folder encounters an EPERM error and aborts.

## 5.90.0
Sun, 29 Jan 2023 20:10:17 GMT

### Updates

- Allow "shellCommand" to be optionally specified for bulk custom commands, so that a centralized script can be used instead of invoking package.json scripts (GitHub #3819)

## 5.89.1
Thu, 26 Jan 2023 02:55:30 GMT

### Updates

- Fix an issue with `rush add` where the approved packages files aren't updated.
- Revert generation of scripts in the Git hooks folder due to various git-related issues
- Upgrade to webpack 5.75.0

## 5.89.0
Tue, 24 Jan 2023 22:30:06 GMT

### Updates

- Fix linking error due to PNPM v7 local install path breaking change
- Introduce "dependsOnAdditionalFiles" configuration option to operations in rush-project.json. This option allows to pass glob (minimatch) patterns pointing to files outside of .git repository. If provided, the hash values of these files will become part of the final hash when reading and writing from cache.
- Use getRepoStateAsync to optimize performance of calculating repository state.
- Generate scripts in the Git hooks folder referring to the actual hook implementations in-place in the Rush `common/git-hooks/` folder instead of copying the scripts to the Git hooks folder.

## 5.88.2
Sun, 22 Jan 2023 04:18:44 GMT

### Updates

- Fix a regression where the 'dist/scripts' folder name was named 'dist/undefined'

## 5.88.1
Wed, 18 Jan 2023 22:44:31 GMT

### Updates

- Fix an issue where `create-scripts.js` does not exist during `rush deploy`.
- Add install-run-rush-pnpm.js script
- Update JSZip to 3.8.0.

## 5.88.0
Thu, 22 Dec 2022 20:11:58 GMT

### Updates

- Improve the experience during a rush operation when the cached credentials have expired. Now, a warning is printed instead of an error being thrown and the operation halted.
- (BREAKING API CHANGE IN @rushstack/rush-azure-storage-build-cache-plugin) Change the signature of `AzureAuthenticationBase.tryGetCachedCredentialAsync` to optionally take an object describing the behavior when credentials have expired. The behavior of the function without an argument is unchanged.

## 5.87.0
Fri, 16 Dec 2022 19:34:26 GMT

### Updates

- Fix a typo in the artifactory.json template
- Writing local build cache is more robust on a network drive.
- Document default value for the "watchDebounceMs" setting
- Add "nodeSupportedVersionInstructions" property to rush.json, allowing maintainers to provide additional instructions if the user's node version is unsupported.
- (IMPORTANT) Fix a regression where the "strictPeerDependencies" setting wasn't applied for some versions of PNPM 7 due to unexpected changes of PNPM's default value (GitHub #3828)
- Fix an issue where if the package manager is PNPM 6.1.0 or newer, and `pnpmStore` is set to `"local"`, then a global cache was still used.
- Write local telemetry for global script actions
- Normalize all newlines in logging statements to LF. On Windows, some newlines were CRLF.
- Upgrade `npm-check` dependency from `~5.9.2` to `~6.0.1`
- Work towards bundling the files of "@rushstack/rush-lib" (Details in GitHub #3837)

## 5.86.0
Tue, 29 Nov 2022 00:10:20 GMT

### Updates

- Add new commands "rush-pnpm patch" and "rush-pnpm patch-commit" for patching NPM packages when using the PNPM package manager (GitHub #3554)

## 5.85.1
Fri, 25 Nov 2022 21:51:32 GMT

### Updates

- Fix an intermittent issue when writing tar log files

## 5.85.0
Thu, 24 Nov 2022 03:57:19 GMT

### Updates

- Add support for a `credentialMetadata` property in the CredentialCache.
- (BREAKING API CHANGE) Change the signature of `CredentialCache.setCacheEntry` to take the credential ID and an object describing the credential instead of a credential string and an expiration date. The second argument's type now matches the return value of `CredentialCache.tryGetCacheEntry`
- (BREAKING API CHANGE) Change the return type of `AzureAuthenticationBase.tryGetCachedCredentialAsync` (and, therefore, `AzureStorageAuthentication.tryGetCachedCredentialAsync`) from `string | undefined` to `ICredentialCacheEntry | undefined` to include the credentialMetadata.

## 5.84.0
Tue, 22 Nov 2022 23:24:56 GMT

### Updates

- Add a "dependsOnEnvVars" configuration option to operations in rush-project.json. The variables specified in this option are included in the cache key hash calculation.
- The "rush setup" user prompts can now be customized.
- Make autoinstaller logging respect the `--quiet` parameter.
- Add project filtering to the upgrade-interactive UI prompt. Also increases the default page size for project lists in UI to 12.
- Add a feature (behind the "cleanInstallAfterNpmrcChanges" experiment) that will cause a clean install to be performed if the common/temp/.npmrc file has changed since the last install.

## 5.83.4
Fri, 18 Nov 2022 04:02:43 GMT

### Patches

- Fix performance regression from supporting git submodules

### Updates

- Change files and change logs can store custom fields.

## 5.83.3
Tue, 15 Nov 2022 18:43:51 GMT

### Patches

- Fix an issue where Git submodules were not handled correctly by the build cache (GitHub #1711)

## 5.83.2
Mon, 14 Nov 2022 05:15:22 GMT

### Updates

- Ensure autoinstaller lockfiles are not leftover after an error

## 5.83.1
Sat, 12 Nov 2022 04:40:57 GMT

### Updates

- Update the "rush init" template for command-line.json to add usage examples for integer, integer list, string list, choice list parameter kinds

## 5.83.0
Fri, 11 Nov 2022 03:51:49 GMT

### Updates

- Add credentialType option for rush setup command
- Rush "setup" command works even if plugins cannot be installed
- Add support for integer, integer list, string list, and choice list parameters in plugins.
- Introduce a `rush upgrade-interactive` action that provides an interactive way to upgrade outdated dependencies.
- Fix a regression from Rush 5.79.0 where "rush init" did not create the pnpm-config.json file automatically

## 5.82.1
Wed, 19 Oct 2022 23:44:02 GMT

_Version update only_

## 5.82.0
Mon, 17 Oct 2022 22:14:39 GMT

### Updates

- Replace Travis with GitHub Actions in the `rush init` template."
- Handle case in ProjectWatcher where a project contains no git tracked files or status information is or was unavailable.
- Refactor @rushstack/rush-azure-storage-build-cache-plugin to expose an API for generating and caching Azure credentials for other workloads, in addition to Storage.
- Validate the change type in changefiles during publishing.

## 5.81.0
Sat, 08 Oct 2022 02:30:30 GMT

### Updates

- Add a `rush remove` command that removes one or more dependencies from a project.
- Support passing a lockfile to "install-run.js" and "install-run-rush.js" to ensure stable installation on CI.
- Add missing "environmentVariables" property to "pnpm-config.json" schema to restore feature parity with "rush.json" "pnpmOptions" field.

## 5.80.1
Mon, 03 Oct 2022 23:11:35 GMT

### Updates

- Add a more useful error message in cases when a merge base for `rush change` cannot be determined.

## 5.80.0
Thu, 29 Sep 2022 07:13:24 GMT

### Updates

- Include the operation duration in the telemetry data that was recorded during the non-cached run when a cache hit occurs.
- Fix an error message that always says to run "rush update --purge" even if the user only needs to run "rush install --purge."
- Fix an issue where a "Current PNPM store path does not match the last one used." error will erroneously get thrown on Windows with an unchanged path, but with a forward slash instead of a backslash.
- Remove fallback from tar binary to npm 'tar' package. The npm 'tar' package would sometimes produce invalid output if the cache entry was corrupt.
- Remove gender from the git config example in rush.json

## 5.79.0
Sat, 24 Sep 2022 17:37:03 GMT

### Minor changes

- Add a `common/config/pnpm-config.json`, which is used to specify fields like `overrides`, `packageExtensions`, and `neverBuiltDependencies` that would otherwise be placed in a PNPM workspace repo's root-level `package.json`'s `pnpm` field.

### Updates

- Add a `--commit` and `--commit-message` flag to `rush change` that commits the change files automatically.

## 5.78.1
Fri, 23 Sep 2022 02:54:44 GMT

### Updates

- Fix Git detection when the current working directory is unrelated to the Rush workspace.
- Fix an error that ocurred if an autoinstaller's  "node_modules" folder was manually deleted (GitHub #2987)

## 5.78.0
Sat, 17 Sep 2022 00:56:37 GMT

### Updates

- Add a "beforeInstall" hook to the plugin API, for plugins to examine the environment immediately before "rush install" or "rush update" invoke the package manager.
- Fix "--parallelism XX%" parsing to return a finite number of CPU cores.
- Update the "rush init" template to include .gitignore patterns for IntellJ IDEA
- Upgrade the @azure/identity and @azure/storage-blob packages to eliminate a deprecation message during installation.
- Define an environment variable RUSH_PNPM_VERIFY_STORE_INTEGRITY that can be used to enable or disable PNPM's store integrity verification during installation for performance.

## 5.77.3
Fri, 02 Sep 2022 17:49:09 GMT

_Version update only_

## 5.77.2
Wed, 31 Aug 2022 00:43:07 GMT

### Updates

- Fix an issue where "rush add" sometimes did not work correctly if a project is nested under another project's folder

## 5.77.1
Tue, 30 Aug 2022 17:26:42 GMT

### Updates

- Fixed an issue where "rush add" was not updating common-versions.json when using "--make-consistent"

## 5.77.0
Mon, 29 Aug 2022 21:09:31 GMT

### Updates

- Add machine architecture information, dependency graph information, and individual build times and statuses to the telemetry file.
- Add schema validation for change files.
- Fix a minor issue with the "--rush-example-repo" template
- Update CLI docs for "rush add"
- Improve some config file documentation
- Make the project tag name syntax more strict to avoid error-prone names such as "tag:$PATH" or "tag://"
- Add validation to ensure package.json files are strict JSON and the "version" field is strict SemVer
- Add a new setting "watchOptions.debounceMs" in command-line.json

## 5.76.1
Mon, 08 Aug 2022 07:32:36 GMT

### Updates

- Fix a recent regression where "rush install" would sometimes fail with "Unknown option: 'ignore-compatibility-db'"

## 5.76.0
Sat, 06 Aug 2022 05:35:19 GMT

### Updates

- Validate that if shouldPublish is set, private is not set
- "rush install/update" should always set "ignore-compatibility-db=true" and print warning if the rush.json pnpmVersion specifies a version affected by this problem. 
- Reorder some initialization logic so that Rush's change analysis is not counted as part of the build time for the first project
- (BREAKING API CHANGE) Rename cyclicDependencyProjects to decoupledLocalDependencies

## 5.75.0
Tue, 28 Jun 2022 03:31:01 GMT

### Updates

- Disable build cache for operations with no corresponding operationSettings entry in rush-project.json, and provide a clear message about why.
- When the `projectName:normalize` token is used in a cache ID, remove the `@` character from the scope.
- Reduce default maxInstallAttempts to 1
- Improve logging of file locations when using the Heft build tool

## 5.74.0
Fri, 10 Jun 2022 22:17:51 GMT

_Version update only_

## 5.73.0
Fri, 10 Jun 2022 21:54:49 GMT

_Version update only_

## 5.72.0
Fri, 10 Jun 2022 20:01:47 GMT

### Updates

- Introduce a "rush-pnpm" shell command for invoking native PNPM commands in a Rush workspace

## 5.71.0
Fri, 27 May 2022 00:50:06 GMT

### Updates

- Write local telemetry for all phased commands, including partial runs when running in watch mode.
- Export the list of workspace packages to the pnpmfile shim.

## 5.70.0
Wed, 11 May 2022 22:21:40 GMT

### Updates

- Add a new `afterExecuteOperations` hook to phased command execution. This hook is used for the console timeline view and the standard result summary.

## 5.69.0
Tue, 10 May 2022 01:20:58 GMT

### Updates

- Fix handling of erroneous undefined values when printing `rush list --detailed`
- Update watcher to only schedule operations impacted by the detected change. A behavior difference will only be observed for repositories that define a phase with no dependencies.
- Fix handing of the `strictPeerDependencies` option when using PNPM >= 7.0.0.
- Update the `postRushInstall` hook to always run, and move its execution to after telemetry is written.
- (BREAKING CHANGE) Remove the "xstitchPreferredVersions" property from common-versions.json and the CommonVersionsConfiguration API.
- Correct a warning that is printed during "rush change" to only be concerned with unstaged changes.
- Include tags in the `rush list` output.

## 5.68.2
Fri, 06 May 2022 18:54:55 GMT

### Updates

- Provide ability for phased script commands to internally invoke "rush install" prior to execution.

## 5.68.1
Tue, 03 May 2022 21:52:56 GMT

### Updates

- Fix an issue where "rush list --json" prints non-json output in a repo that uses rush plugins with autoinstallers.

## 5.68.0
Fri, 29 Apr 2022 05:22:05 GMT

### Updates

- Disable legacy skip logic when build cache is enabled.
- Report status of projects with an empty script as "did not define any work," instead of as "from cache."
- Add a -- parameter to git command invocations that accept user input to prevent arbitrary arguments from being passed.
- Remove the @deprecated label from `RushConfigurationProject.packageJson`.

## 5.67.0
Sat, 23 Apr 2022 02:13:20 GMT

### Updates

- Upgrade "tar" dependency to eliminate spurious security vulnerability for "minimist" package
- Remove requirement that custom parameters associated with a phased command must also be associated with one or more phases. This allows for custom parameters that will only be interpreted by plugins.

## 5.66.2
Tue, 12 Apr 2022 02:58:47 GMT

### Updates

- Fix an issue where running the "install-run-rush" script with the "--help" parameter won't install Rush.

## 5.66.1
Tue, 12 Apr 2022 01:52:38 GMT

### Updates

- Fix watch-mode phased commands when rush.json is not in the repository root. Fix watch-mode change detection on Linux.

## 5.66.0
Sat, 09 Apr 2022 02:24:40 GMT

### Updates

- (BREAKING CHANGE) Update references to the default branch to reference "main" instead of "master".

## 5.65.1
Fri, 08 Apr 2022 23:10:18 GMT

_Version update only_

## 5.65.0
Fri, 08 Apr 2022 06:16:59 GMT

### Updates

- Expose APIs for managing Azure credentials from @rushstack/rush-azure-storage-build-cache-plugin.
- Add flushTelemetry hook
- Fix an edge case where `rush update` fails in a PNPM workspaces repo with no dependencies.
- Fix some issues with "rush add"'s ability to determine which version to use when adding a dependency that is already present in the repo.
- Add support for percentage values for --parallelism flag, eg. "50%".
- Improve retry logic in the Amazon S3 cloud cache plugin and improve reporting when the user is not authenticated.
- Add an additional plugin to rush-azure-storage-build-cache-plugin that can be used to prompt for Azure authentication before a command runs.
- Change the way "rush change" prints long lists of package names to include an "(and <count> more)" line after the first five listed by name.
- Add a "tags" field to project definitions in rush.json. These may be used to select projects, for example, "rush list --only tag:my-custom-tag".
- Fix a typo in output of `rush change -v`

## 5.64.0
Fri, 01 Apr 2022 04:51:31 GMT

### Updates

- Add support for suppressing startup information to invocations of `rush`, `rushx`, and the `install-run-rush` scripts.
- Add --timeline option for more detail generated at end of rush build
- Expose plugin hooks for phased command execution: the "createOperations" hook allows customizing the set of operations to execute, and the "waitingForChanges" hook gives plugins an opportunity to display data to the console while output is paused.

## 5.63.1
Sat, 26 Mar 2022 00:47:39 GMT

### Patches

- Fix an issue where the build cache is never written to.

### Updates

- Fix broken README links for @microsoft/rush-lib documentation and API reference.

## 5.63.0
Tue, 15 Mar 2022 19:18:12 GMT

### Updates

- Reinstall automatically if monorepo folder is moved
- Fix resolution of change file paths when rush.json is not in the root of the Git repository.
- Fix the "selected operations" logging for commands that skipped projects to only display the operations that will be executed.
- For watch mode commands, allow the command to continue even if the initial build fails.
- Allow adding of aliased child packages.
- Add plugin hooks for global and phased commands and allow plugins to tap into command execution by command name, or into the execution of any command by command kind.
- Fix a typo in the "rush add" command-line help.

## 5.62.4
Tue, 15 Feb 2022 01:40:57 GMT

### Updates

- Remove the lib/index.mjs file from the @rushstack/rush-sdk package. This package must be CommonJS.
- Do not load the PowerShell User Profile for running the AsyncRecycler task

## 5.62.3
Fri, 11 Feb 2022 02:18:05 GMT

### Updates

- Fix an issue where the git tag would not include the prerelease portion of the version, which will cause subsequent publishes of the same version to not be tagged.

## 5.62.2
Thu, 10 Feb 2022 03:21:41 GMT

### Updates

- Add the ability to forcibly replace bad cache entries generated by issues in a previous Rush release.
- Fix an issue where the dependencies of lockstep-versioned projects aren't bumped when the lockstep-versioned projects' versions are bumped. This issue only arose in the scenario when the lockstep-versioned projects' version bumps are driven by the change type in the changefiles and not by the "nextBump" property in "common/config/rush/version-policies.json"
- Fix an issue where "rush setup" reported a TypeError when invoked from Git Bash
- Fix a bug where `rush change --verify` would not find the correct `common/changes` folder if the `rush.json` is not in the Git repo's root folder.
- Add support for rush-sdk to be bundled with Webpack.
- Add watch mode support to "phased" command definitions via the "watchOptions" property with a subfield "watchPhases". This separates the initial command phases from the phases run by the file watcher, e.g. so that the initial execution can pull from cache and the watch mode execution can use a separate incremental build phase.

## 5.62.1
Sun, 06 Feb 2022 04:59:08 GMT

### Updates

- Fix an issue where cache entries in certain circumstances would be missing files in nested subfolders. For full details see https://github.com/microsoft/rushstack/pull/3211.

## 5.62.0
Sat, 05 Feb 2022 00:55:18 GMT

### Updates

- Add support for directly invoking a script that depends on `rush-sdk` from inside a Rush repo.
- Add support for a new URL-based version specifier in PNPM lockfiles.
- Add support for specifying a custom S3 endpoint. This is useful for using a custom S3 provider.
- Optimize invocation of tar to use stdin instead of a temporary file.
- Revise architecture of symbolic link scan to use a queue and parallel file system calls.
- Create separate tar logs per phase based on cache id.
- Pack tar to a temp file, then move into the cache to ensure cache integrity.
- Fix git-hooks folder check failing when compared paths have different drive letter casing

## 5.61.4
Wed, 02 Feb 2022 04:03:24 GMT

### Updates

- Bump tar dependency to have a minimum version of 5.0.10.

## 5.61.3
Fri, 28 Jan 2022 21:03:58 GMT

### Updates

- Update the built-in cache provider plugins (rush-amazon-s3-build-cache-plugin and rush-azure-storage-build-cache-plugin) to apply for all commands, enabling cloud caching for custom phased and bulk commands.
- Allow build cache to be enabled for custom bulk commands.

## 5.61.2
Thu, 27 Jan 2022 02:30:10 GMT

### Updates

- Update node-fetch dependency version to address CVE-2022-0235

## 5.61.1
Sat, 22 Jan 2022 04:22:52 GMT

### Updates

- (EXPERIMENTAL) Allow common/config/rush/command-line.json to specify the build command as a phased command without specifying all of the options required by the schema. The remaining options will come from the default. This is already supported when a partially-specified build command has "commandKind" set to "bulk".
- Fix an issue where Git Bash "tar" does not handle Windows paths correctly.
- (EXPERIMENTAL) Improve the RUSH_BUILD_CACHE_WRITE_ALLOWED environment variable behavior so that it also affects the local build cache. This saves CPU cycles on CI machines that only run a single build. It also avoids cache writes for watch mode commands.
- Refactoring to support upcoming watch mode improvements: Rework the task execution engine to interact with the task queue using the ECMAScript async iteration protocol (GitHub #3043)
- Fix project change detection when a new project is added to a repo that uses PNPM with useWorkspaces=false (GitHub #3183)

## 5.61.0
Sat, 22 Jan 2022 03:17:59 GMT

### Updates

- (EXPERIMENTAL) Fix a regression for the plugins feature, which caused an error message "command-line.json defines a command 'build' using a name that already exists" (GitHub #3155)

## 5.60.0
Thu, 20 Jan 2022 02:46:15 GMT

### Updates

- Fix the "allowWarningsInSuccessfulBuild" option in bulk commands defined in common/config/command-line.json.
- (BREAKING CHANGE) The experimental config file options "skipPhasesForCommand" and "addPhasesToCommand" have been temporarily removed until their design can be better formalized.
- Include NodeJS 16 in the range of supported versions (`nodeSupportedVersionRange`) in the `rush.json` file generated by `rush init`.
- (BREAKING CHANGE) Some experimental fields have been renamed in "config/rush-project.json". Please see UPGRADING.md for details.

## 5.59.2
Fri, 07 Jan 2022 02:34:59 GMT

### Updates

- Fixes a regression that broke "rush build" completely when not using the "--only" parameter.

## 5.59.1
Fri, 07 Jan 2022 01:21:44 GMT

### Patches

- Fixes a regression in bulk command execution when using "unsafe" selector parameters, e.g. "--only". Ensures that only the projects selected by the parameters get included in the build, rather that forcibly including all dependencies.

## 5.59.0
Thu, 06 Jan 2022 22:18:13 GMT

### Minor changes

- Update the "rush init" template to enable pnpm workspaces and to merge the pnpm-lock.yaml file as text.

### Updates

- Fix an issue that occurs when running a command with a selection argument with a Git ref (like `--from git:main`) in a repo with a pnpm lockfile larger than 1MB.
- Fix an issue with installing Git hooks that occurs when the rush.json folder isn't at the repo's root.
- (BREAKING CHANGE) Remove the experimental command "rush write-build-cache", since it is no longer needed and would be incompatible with phased builds. If you need this command for some reason, please create a GitHub issue.
- Add support for phased commands behind the multiPhaseCommands experiment.
- Update "rush init" to write files with OS-default line endings (CRLF on Windows, LF otherwise) instead of always writing CRLF line endings.

## 5.58.0
Thu, 16 Dec 2021 05:39:21 GMT

### Updates

- Fix an issue where Rush's Git hooks were broken if another tool such as Husky had tampered with the `core.hooksPath` (GitHub #3004)
- Provide a more useful error message if the git version is too old.
- Allow "rush list" to be invoked while other rush processes are running in the same repo.
- For project selection parameters such as "rush build --to git:REF", improve the diff analysis to detect which individual projects are impacted by a modification of the PNPM lockfile (GitHub #3050)
- Allow multiple remote URLs to be specified in the rush.json in the new repository.urls field.
- (BREAKING CHANGE) Replace the RushConfiguration repositoryUrl field with repositoryUrls to support multiple remote URLs specified in rush.json.

## 5.57.1
Thu, 09 Dec 2021 00:24:47 GMT

_Version update only_

## 5.57.0
Fri, 03 Dec 2021 02:16:10 GMT

### Updates

- Add support for the "filterLog" hook in common/config/rush/.pnpmfile.cjs
- (EXPERIMENTAL) Ability to load third-party plugin packages that customize the behavior of Rush
- Fix an issue where parameter values containing spaces are incorrectly passed to global scripts.
- Parameters such as "--to" and "--from" now accept selector expressions: "version-policy:NAME" indicates the set of projects belonging to a publishing version policy. "git:REF" detects the set of projects that have been modified since the specified Git revision; for example, this allows a Rush command to process only the projects modified by a PR branch. (GitHub #2968)
- Improved the change detection logic to work correctly when a second rush.json appears in a subfolder.
- (EXPERIMENTAL) Add a new NPM package "@rushstack/rush-sdk" for use by Rush plugins
- Stop deleting the pnpm-store after failed workspace installs. Usually a multiple failure is due to a network error or a package that does not exist in the registry, not an issue with the pnpm-store.

## 5.56.0
Thu, 28 Oct 2021 23:49:31 GMT

### Updates

- Add CI skipping to default version & changelog commits
- Update suggested version of NPM
- Fix update-autoinstaller with NPM
- Streamline rushx output and add quiet flag.
- Include support for adding multiple packages with the "rush add" command.
- Update the package.json repository field to include the directory property.
- Fix the error message printed when `--interactive` is passed to `rush update-cloud-credentials` and the cloud cache provider is Amazon S3.
- Mark Node 16 as the current latest LTS version.
- support `--debug-package-manager` install options for yarn

## 5.55.1
Tue, 12 Oct 2021 22:26:25 GMT

### Updates

- Fix an issue where a version field isn't parsed correctly when using NPM version 7 and newer.

## 5.55.0
Thu, 07 Oct 2021 23:44:52 GMT

### Updates

- Fix typo when project dependencies do not match the current shrinkwrap
- Use ITerminal in the rush-lib API instead of Terminal to allow for compatibility with other versions of @rushstack/node-core-library.
- Add a new parameter "--detailed" for the "rush list" command
- Print the full event hooks output if the --debug paramter is specified.
- Upgrade the `@types/node` dependency to version to version 12.

## 5.54.0
Wed, 22 Sep 2021 22:54:17 GMT

### Minor changes

- Add ability to customize tag separator

### Patches

- Lock node-fetch dependency to 2.6.2 due to an incompatibility with 2.6.3 in the Azure Cloud Cache Provider.

### Updates

- Add a "--check-only" parameter to "rush install" to check the validity of the shrinkwrap without performing a full install.
- Fix an issue where `rush update-autoinstaller` does not use the repo's .npmrc

## 5.53.0
Fri, 10 Sep 2021 23:20:00 GMT

### Updates

- Fix an issue where the incremental build should use caching or skipping, but not both (GitHub #2891)
- Cache rush-project.json reads
- Fix an issue where the build cache did not respect "allowWarningsInSuccessfulBuild" (GitHub #2803)
- Add an experiment "buildCacheWithAllowWarningsInSuccessfulBuild" to allow caching for projects with warnings (GitHub #2803)

## 5.52.0
Mon, 23 Aug 2021 21:34:46 GMT

### Updates

- Add properties to the extraData section of the telemetry file for parameter usage in the install commands
- Add .heft to .gitignore file generated by rush init

## 5.51.1
Fri, 13 Aug 2021 22:45:36 GMT

### Updates

- When build cache is enabled in `rush build`, allow projects downstream to be satisfied from the cache if applicable. Cache reads will still be disabled for `rush rebuild`.

## 5.51.0
Wed, 11 Aug 2021 23:16:09 GMT

### Updates

- The --debug flag now also shows additional diagnostic information.
- Update JSZip dependency.
- Adds support for the project subset selection parameters ("--to", "--from", etc., documented at https://rushjs.io/pages/developer/selecting_subsets/) to the "rush list" command.
- Allow the tar binary path to be overridden via the RUSH_TAR_BINARY_PATH environment variable.

## 5.50.0
Sat, 17 Jul 2021 01:16:04 GMT

### Minor changes

- (Breaking change) Remove the experimental "--disable-build-cache" command line parameter.

### Patches

- When the experimental build cache is enabled, "rush rebuild" now forces cached projects to be rebuilt  (GitHub #2802)

## 5.49.2
Thu, 15 Jul 2021 01:47:18 GMT

### Updates

- Fix incremental build state calculation when using filtered installs

## 5.49.1
Tue, 13 Jul 2021 23:03:01 GMT

### Updates

- Fix an issue where the "--no-fetch" "rush change" parameter would cause a "git fetch" and absence of that parameter wouldn't fetch.

## 5.49.0
Tue, 13 Jul 2021 06:22:09 GMT

### Updates

- Expose APIs useful for determining which projects have changed on the current branch compared to another branch.

## 5.48.0
Fri, 09 Jul 2021 01:44:18 GMT

### Updates

- Add RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD environment variable
- Prevent "rush change" from prompting for an email address, since this feature was rarely used. To restore the old behavior, enable the "includeEmailInChangeFile" setting in version-policies.json
- The "rushx" command now reports a warning when invoked in a project folder that is not registered in rush.json
- Fix the build-cache.json cacheEntryNamePattern description of the [normalize] token.
- When selection CLI parameters are specified and applying them does not select any projects, log that the selection is empty and immediately exit.
- Fix an issue where files restored by the build cache did not have a current modification time
- Upgrade the "rush init" template to use PNPM version 6.7.1; this avoids an important regression in PNPM 6.3.0 where .pnpmfile.cjs did not work correctly: https://github.com/pnpm/pnpm/issues/3453
- Fix a JSON schema issue that prevented "disableBuildCache" from being specified in command-line.json
- Removed dependency on chokidar from BulkScriptAction in watch mode, since it adds unnecessary overhead.

## 5.47.0
Sat, 15 May 2021 00:02:26 GMT

### Updates

- For the experimental build cache feature, eliminate the RUSH_BUILD_CACHE_WRITE_CREDENTIAL environment variable; it is replaced by several new variables RUSH_BUILD_CACHE_CREDENTIAL, RUSH_BUILD_CACHE_WRITE_ALLOWED, and RUSH_BUILD_CACHE_ENABLED
- Take pnpm-workspace.yaml file into consideration during install skip checks for PNPM
- Fix a build cache warning that was sometimes displayed on Windows OS: "'tar' exited with code 1 while attempting to create the cache entry" (GitHub #2622)
- Fix an issue where "rushx" CLI arguments were not escaped properly (GitHub #2695)
- Allow rush-project.json to specify incrementalBuildIgnoredGlobs (GitHub issue #2618)
- Remove support for PNPM < 5.0.0 and remove the "resolutionStrategy" option
- Update "rush init" assets to use newer versions of Rush and PNPM. If you are looking to use PNPM < 6, you must rename the initialized ".pnpmfile.cjs" file to "pnpmfile.js". For more information, see: https://pnpm.io/5.x/pnpmfile
- Transform package.json using pnpmfile before checking if a Rush project is up-to-date
- Add support for the Yarn "resolutions" package.json feature.

## 5.46.1
Tue, 04 May 2021 20:26:15 GMT

### Updates

- Fix an issue where the buildCacheEnabled setting was not applied correctly

## 5.46.0
Tue, 04 May 2021 02:45:20 GMT

### Updates

- Remove "buildCache" setting from experiments.json; it is superseded by "buildCacheEnabled" in build-cache.json
- Add a "rush init" template for build-cache.json
- Temporarily downgrade the "@azure/identity" to eliminate the keytar native dependency (GitHub issue #2492)

## 5.45.6
Fri, 30 Apr 2021 00:32:16 GMT

### Updates

- Fix a regression in the S3 cloud build cache provider

## 5.45.5
Wed, 28 Apr 2021 17:54:16 GMT

### Updates

- Improve diagnostic messages printed by the rush build cache
- Fix an issue where Rush fails to run on Windows when the repository absolute path contains a space
- Use simpler and more accurate check before skipping installs

## 5.45.4
Fri, 23 Apr 2021 22:48:23 GMT

_Version update only_

## 5.45.3
Fri, 23 Apr 2021 22:03:08 GMT

### Updates

- Allow prerelease versions of PNPM to be used in workspaces mode

## 5.45.2
Thu, 22 Apr 2021 23:07:51 GMT

### Updates

- Fix bad installs with when using pnpmfile in PNPM 6

## 5.45.1
Wed, 21 Apr 2021 23:38:22 GMT

### Updates

- Ensure that pnpm-workspace.yaml is always fully regenerated during "rush install" or "rush update"
- Fix support for pnpmfile in PNPM 6.

## 5.45.0
Tue, 20 Apr 2021 19:04:04 GMT

### Updates

- Print diagnostic information to a log file "<project-root>/.rush/build-cache-tar.log" when the native "tar" is invoked.
- The Amazon S3 build cloud cache provider can now use buckets outside the default region
- Add support for PNPM 6

## 5.44.0
Sat, 17 Apr 2021 00:17:51 GMT

### Updates

- Add --json and --all param to rush scan
- Fix "rush deploy" having "includeDevDependencies" turned on to deploy "devDependencies" for rush projects only

## 5.43.0
Thu, 08 Apr 2021 06:09:52 GMT

### Updates

- Add "--ignore-git-hooks" flags to "publish" and "version" commands to prevent the execution of all git hooks
- Fix parameter name typo.
- Eliminate a spurious warning that was displayed on Azure DevOps build agents: A phantom "node_modules" folder was found.
- Fix an issue where "rush change" reported "Unable to find a git remote matching the repository URL" when used with SSH auth
- Fix an issue where "rush publish" reported 403 errors if the package version included a SemVer build metadata suffix
- Partially deprecate RUSH_TEMP_FOLDER environment variable
- Validate changefiles against a schema when running 'rush change --verify'

## 5.42.4
Mon, 29 Mar 2021 05:57:18 GMT

### Updates

- Don't validate the shrinkwrap when running 'rush update'
- Gracefully handle a simultaneous upload to Azure Storage.
- Update rush publish -p flag description

## 5.42.3
Wed, 17 Mar 2021 05:07:02 GMT

### Updates

- Fix installation-time behavior of "omitImportersFromPreventManualShrinkwrapChanges" experiment.
- Don't upload build cache entries to Azure if the cache entry already exists.
- Replace the AWS dependencies with use of the Amazon S3 REST API.
- Add support for anonymous read from an Amazon S3-hosted cache.

## 5.42.2
Tue, 16 Mar 2021 00:30:38 GMT

### Updates

- Add experiment to exclude the "importers" section of "pnpm-lock.yaml" from the "preventManualShrinkwrapChanges" feature.

## 5.42.1
Fri, 12 Mar 2021 02:11:24 GMT

### Updates

- Temporarily disable the AWS S3 credential provider logic to mitigate a problematic peer dependency (GitHub #2547)

## 5.42.0
Wed, 10 Mar 2021 06:25:44 GMT

### Updates

- Add AWS S3 support to the experimental build cache feature

## 5.41.0
Wed, 10 Mar 2021 05:12:41 GMT

### Updates

- Fix an issue where "rush install" could stall indefinitely because a network request did not handle timeouts properly
- Allow merge conflicts in repo-state.json to be automatically resolved.
- Add a RUSH_INVOKED_FOLDER environment variable so that custom scripts can determine the folder path where Rush was invoked (GitHub #2497)
- Add `preferFrozenLockfileForUpdate` option to minimize lockfile churn by passing --prefer-frozen-lockfile to pnpm during default `rush update`.

## 5.40.7
Tue, 02 Mar 2021 23:27:41 GMT

### Updates

- Fix a regression where certain Rush operations reported a TypeError (GitHub #2526)

## 5.40.6
Tue, 02 Mar 2021 06:22:01 GMT

### Updates

- Improve cache read/write perf by attempting to use the "tar" binary.
- Fix default text in rush.json generated by "rush init."
- Fix an issue where Rush would fail to restore from cache but report success when Git isn't present.

## 5.40.5
Tue, 23 Feb 2021 03:26:25 GMT

### Updates

- Account for indirect dependencies when ordering projects in "rush build" if the intermediary dependencies are excluded by selection parameters.

## 5.40.4
Tue, 23 Feb 2021 00:01:20 GMT

### Updates

- Make Rush per-project manifest generation more reliable and remove PNPM shrinkwrap validation

## 5.40.3
Sun, 21 Feb 2021 01:05:53 GMT

### Updates

- Fix an issue where "rush setup" did not work correctly with NPM 7.x due to an NPM regression

## 5.40.2
Fri, 19 Feb 2021 06:28:28 GMT

### Updates

- Allow usage of Node.js 8.x since we received feedback that some projects are still supporting it

## 5.40.1
Fri, 19 Feb 2021 01:45:27 GMT

### Updates

- Fix a minor issue with the "rush init" template

## 5.40.0
Wed, 17 Feb 2021 01:35:11 GMT

_Version update only_

## 5.39.2
Wed, 17 Feb 2021 01:34:11 GMT

### Updates

- (EXPERIMENTAL) Add a "--disable-cache" parameter for disabling the build cache.
- (EXPERIMENTAL) Add a "disableBuildCache" setting in command-line.json for disabling the build cache.
- (EXPERIMENTAL) Add options in rush-project.json for disabling the build cache for entire projects, or for individual commands for that project.
- Normalize selection CLI parameters for "rush install"
- Add experimental "rush setup" command
- Add an experimental new config file common/config/artifactory.json for enabling Artifactory integration

## 5.39.1
Sat, 13 Feb 2021 03:14:52 GMT

### Patches

- Convert the experimental "--watch" parameter into a "watchForChanges: true" setting in command-line.json, based on user feedback

### Updates

- Disable build cache after initial build when "--watch" is specified. This saves disk space, reduces CPU usage, and improves compatibility with downstream file watcher processes (e.g. "webpack --watch").

## 5.39.0
Thu, 11 Feb 2021 04:06:02 GMT

### Minor changes

- Add a new parameter "--watch" that watches for filesystem changes and rebuilds the affected Rush projects; this feature can also be used with custom bulk commands (GitHub #2458, #1122)

### Updates

- Improve the wording of some log messages

## 5.38.0
Mon, 01 Feb 2021 20:42:04 GMT

### Updates

- Add new command-line parameters for bulk commands: "--to-except", "--from", "--only", "--impacted-by", "--impacted-by-except", and "--from-version-policy" (GitHub #2354)
- Change the short name for "--changed-projects-only" to be "-c" (so that "-o" can be used for the new "--only" parameter)
- Change the "--from" parameter so that it now includes all dependencies as people expected.  To skip dependencies, use the new "--impacted-by" parameter.  (GitHub issue #1447)

## 5.37.0
Sat, 30 Jan 2021 01:50:27 GMT

### Updates

- Improve performance of association of repo file states with projects to speed up build commands in large repos.
- Add `publishFolder` property to the project configuration to allow publishing a sub-folder of the project
- Add support for --from flag for filtered installs when using workspaces
- Fix an issue where the Rush cache feature did not correctly detect files that were both tracked by git and were expected to be cached build output.
- Improve logging for the "rush write-build-cache" command
- Correct some spelling mistakes in rush.json
- Fix an error "Cannot get dependency key" sometimes reported by "rush install" (GitHub #2460)
- Updade the "rush init" template to specify PNPM 5.15.2, which fixes a performance regression introduced in PNPM 5.13.7

## 5.36.2
Thu, 21 Jan 2021 04:51:19 GMT

### Updates

- Update Node.js version checks to support the new LTS release
- Update rush.json produced by rush init to use PNPM 5.14.3
- Use forward slashes when creating deploy zip file for Unix compatibility

## 5.36.1
Fri, 08 Jan 2021 06:12:37 GMT

### Updates

- Fix an issue where projects with empty scripts would still have arguments appended.

## 5.36.0
Fri, 08 Jan 2021 05:36:55 GMT

### Updates

-  Allow the git binary path to be overridden via the RUSH_GIT_BINARY_PATH environment variable.
- Introduce an experimental build cache feature.
- Add the ability to customize the commit message used when "rush version" is run.
- Remove the "experimental" label from some Rush commands that are now stable.

## 5.35.2
Tue, 03 Nov 2020 23:34:30 GMT

### Updates

- Fix bug where version process is using a wrong `git.addChanges` signature

## 5.35.1
Fri, 30 Oct 2020 05:17:42 GMT

### Updates

- Fix a recent "rush scan" regression (which resulted from enabling "esModuleInterop")

## 5.35.0
Wed, 28 Oct 2020 21:44:10 GMT

### Updates

- Adds an --ignore-hooks flag to every rush action that skips event hooks during execution of the action.
- Fix bug where version process was not adding version-policy configuration file changes into the version commit

## 5.34.4
Sat, 17 Oct 2020 00:23:18 GMT

### Updates

- When running `rush version --bump`, only include package.json updates in the generated commit
- Fix Rush peer dependency validation when satisfied with a package alias
- Prevent `rush unlink` from breaking installs for non-workspace projects
- Add documentation for incremental option for buld custom commands

## 5.34.3
Wed, 30 Sep 2020 21:04:15 GMT

### Updates

- Update to build with @rushstack/heft-node-rig
- Update README.md
- Upgrade compiler; the API now requires TypeScript 3.9 or newer

## 5.34.2
Mon, 21 Sep 2020 22:00:03 GMT

### Updates

- Fix an issue where "rush build" output was lagged due to stream-collator not activating streams aggressively enough
- Fix incorrect "successful" exit status code

## 5.34.1
Thu, 17 Sep 2020 07:13:04 GMT

### Updates

- Fix a regression that reported an error "The EnvironmentConfiguration must be initialized before values can be accessed"

## 5.34.0
Thu, 17 Sep 2020 01:23:35 GMT

### Updates

- Big redesign of "rush build" console reporting (fixes GitHub #2135)
- Implement RUSH_GLOBAL_FOLDER environment variable (GitHub #2187)
- Use underscores instead of asterisks for italic formatting in changelogs to match the way Prettier formats italics in markdown.
- In PNPM 5, --no-lock and --resolution-strategy flags have been removed. Do not pass these flags if they are not supported by the PNPM version used in the repository.

## 5.33.2
Fri, 21 Aug 2020 22:45:58 GMT

### Updates

- Fix an issue where PNPM would sometimes prompt for input during "rush publish" (GitHub #1940)
- Fix an issue that prevented Rush from logging in verbose mode

## 5.33.1
Thu, 20 Aug 2020 18:25:41 GMT

### Updates

- Fix issues where installs could fail after running 'rush version' while the 'usePnpmFrozenLockfileForRushInstall' experiment is enabled. See PR #2116 for more details.
- Fix an issue where "rush deploy" would sometimes report an "already exists" when using the "files" setting in package.json (GitHub #2121)
- Allow multiple simultaneous invocations of "rush deploy" (GitHub #2125)
- Load and validate local projects lazily to further improve Rush startup times.

## 5.33.0
Wed, 19 Aug 2020 00:17:48 GMT

### Updates

- Add support for shell tab completion. See PR for details: https://github.com/microsoft/rushstack/pull/2060
- Use Import.lazy() to optimize the startup time for Rush

## 5.32.3
Tue, 18 Aug 2020 03:48:56 GMT

### Updates

- Fix an issue where install-run.js sometimes assigned the shell PATH incorrectly due to inconsistent character case

## 5.32.2
Fri, 14 Aug 2020 21:03:48 GMT

### Updates

- Resolve issue with version --bump where the wrong hash would get written to the pnpm-lock file

## 5.32.1
Fri, 14 Aug 2020 04:06:30 GMT

### Updates

- Change method used to calculate integrity of tarballs

## 5.32.0
Thu, 13 Aug 2020 00:53:43 GMT

### Patches

- Update temp project tarball integrities during rush bump

## 5.31.0
Wed, 12 Aug 2020 19:33:44 GMT

### Updates

- Updated project to build with Heft
- Fix an issue where "rushx" did not pass additional command-line arguments to the package.json script (GitHub #1232)

## 5.30.3
Fri, 07 Aug 2020 21:09:05 GMT

### Updates

- Fix an issue where Mac OS sometimes reported "An unrecognized file .DS_Store was found in the Rush config folder"

## 5.30.2
Wed, 05 Aug 2020 17:57:07 GMT

### Updates

- Fix an issue where a package version bump would not bump downstream packages with a `workspace:*` dependency specifier.

## 5.30.1
Thu, 23 Jul 2020 23:47:59 GMT

### Updates

- Fixed an isssue where the "rush build" incremental analysis sometimes reported a warning with large diffs (GitHub #501) or filenames that contain spaces, quotes, or other unusual characters (GitHub #2007)
- Prevent incorrect conversion to "workspace:" notation for peer dependencies when running "rush update --full"

## 5.30.0
Fri, 17 Jul 2020 05:32:38 GMT

### Minor changes

- Prepare to deprecate 'rush link' and 'rush unlink' commands, as well as the '--no-link' install argument. As we move toward using package managers more directly in Rush, the package managers will perform the linking during install (if linking is even necessary). Additionally, these commands directly conflict with (and have different meanings than) their package manager counterparts. Lastly, similar goals can be accomplished by running 'rush install' and 'rush purge'. In addition to these changes, rush-link.json deprecated and is replaced with a new API which keeps the local dependency tree in memory.

## 5.29.1
Thu, 16 Jul 2020 02:18:39 GMT

### Patches

- Consider package.json when determining if install can be skipped for PNPM workspaces

## 5.29.0
Tue, 14 Jul 2020 05:20:56 GMT

### Updates

- Give \"rush deploy\" the ability to select a subset of dependencies to copy over (#1978)
- Fix an issue where package binaries where not created by "rush deploy" (#1982)
- Add a new setting "folderToCopy" and new command-line parameter "--create-archive" for use with "rush deploy"

## 5.28.0
Wed, 08 Jul 2020 06:56:47 GMT

### Minor changes

- Add preliminary workspaces support for PNPM

### Updates

- Add new commands "rush init-autoinstaller" and "rush update-autoinstaller"
- Add support for filtered installs when using workspaces

## 5.27.3
Fri, 03 Jul 2020 06:16:09 GMT

### Updates

- Added support for new format used by pnpm for tarball URLs that now begin with an @ symbol

## 5.27.2
Thu, 02 Jul 2020 01:52:18 GMT

### Updates

- Improve "rush deploy" to copy PNPM workaround links (fixes GitHub #1942 and 1943)

## 5.27.1
Mon, 29 Jun 2020 18:39:59 GMT

### Updates

- Fix an issue where environment variable trimming for .npmrc was unnecessarily performed on comment lines
- Add a "rush init" template for .npmrc-publish
- Fix a regression affecting GitHub specifiers for package.json dependencies (issue #1749)

## 5.27.0
Sun, 21 Jun 2020 04:48:53 GMT

### Updates

- Improve "rush deploy" to apply pnpmfile.js when calculating dependencies

## 5.26.0
Mon, 15 Jun 2020 01:26:24 GMT

### Updates

- Breaking change for the experimental "rush deploy" feature: Simplify the config file design, based on the discussion from GitHub #1906

## 5.25.2
Thu, 11 Jun 2020 05:34:31 GMT

### Updates

- Fix an issue where Git hook scripts failed in some environments due to CRLF newlines

## 5.25.1
Thu, 11 Jun 2020 05:05:30 GMT

### Updates

- Fix some minor errors in the "rush init" template that occured when Prettier reformatted the template file macros
- Add a sample Git hook file to the "rush init" template
- Fix a minor issue where "rush link" failed if no projects were defined yet in rush.json
- Add "--no-verify" for commits performed by "rush version", since Git hook scripts may fail on CI machines

## 5.25.0
Wed, 10 Jun 2020 23:53:27 GMT

### Updates

- Add new command-line.json setting "autoinstallerName"

## 5.24.4
Mon, 08 Jun 2020 18:04:35 GMT

### Updates

- Explicitly assigning the option value for --resolution-strategy. This fixes a crash with pnpm v5, which deprecated the option.
- Fix an issue where install-run.js is not able to find its own .bin in PATH
- Fix an issue where "rush install" sometimes skipped regenerating temporary packages, which is incompatible with PNPM's "--frozen-lockfile" feature

## 5.24.3
Thu, 04 Jun 2020 22:50:56 GMT

### Updates

- Fix an issue where "rush deploy" generated incorrect symlinks on Mac OS if the target folder was symlinked (GitHub #1910)

## 5.24.2
Wed, 03 Jun 2020 05:35:19 GMT

### Updates

- Expect error when trying to resolve optional dependency during deploy

## 5.24.1
Tue, 02 Jun 2020 03:11:32 GMT

### Updates

- Fix an issue where the "linkCreation" defaulted to "none" instead of "default"

## 5.24.0
Mon, 01 Jun 2020 08:48:49 GMT

### Updates

- Set next LTS node version to 14.
- Add new "rush deploy" command that copies subsets of files/symlinks to a deployment folder

## 5.23.5
Thu, 28 May 2020 22:49:57 GMT

### Updates

- Fix an issue where Rush cannot reinstall itself on Windows

## 5.23.4
Thu, 21 May 2020 15:41:59 GMT

### Updates

- Add a new rush.json setting "allowMostlyStandardPackageNames"
- Add RUSH_PARALLELISM environment variable for specifying the --parallelism default

## 5.23.3
Fri, 15 May 2020 08:10:59 GMT

### Updates

- Fix a few instances of missing spaces in --help documentation.
- Provide an option to pass --frozen-lockfile to pnpm for rush install

## 5.23.2
Wed, 22 Apr 2020 18:44:26 GMT

### Updates

- Add common-versions.json to the set of files that, when changed, will trigger reinstallation of dependencies.

## 5.23.1
Wed, 15 Apr 2020 03:33:55 GMT

### Updates

- Fix a regression in Rush 5.19.0 where customizing "rush rebuild" would call the "build" script instead of the "rebuild" script.
- Fix an issue where, on some minimal systems, Rush used a missing shell command to detect an application path.
- Fix an issue where the common/temp/*.tgz files resulted in different shrinkwrap files on different operating systems

## 5.23.0
Sat, 04 Apr 2020 00:38:29 GMT

### Updates

- Add a new rush.json setting "preventManualShrinkwrapChanges" which prevents against accidental mistakes in pnpm-lock.yaml.
- Upgrade node-tar
- Remove some misleading log output for "rush build" (GitHub #1733)

## 5.22.0
Wed, 18 Mar 2020 01:23:22 GMT

### Updates

- Replace dependencies whose NPM scope was renamed from `@microsoft` to `@rushstack`
- Support setting environment variables for package manager install processes in rush.json and expose --max-install-attempts as a parameter for rush install/update.

## 5.21.0
Sat, 07 Mar 2020 05:36:08 GMT

### Updates

- Make the event hook failure message print in yellow.
- Improve phrasing of an error message.
- Add a new command-line.json setting "required" for non-optional parameters
- Implement `pnpmOptions.pnpmStore` and RUSH_PNPM_STORE_PATH, to allow the end-user to define where PNPM will place its store.
- Add a --json flag for "rush check" to facilitate automation

## 5.20.0
Wed, 12 Feb 2020 21:51:19 GMT

### Updates

- Support "." as a value for the --to and --from parameters to build to the current project.
- Improve security by allowing the "rush publish" authentication token to be specified via an environment variable.

## 5.19.4
Tue, 28 Jan 2020 03:57:30 GMT

### Updates

- Fix an issue where a missing "repository" property in rush.json would cause "rush change" to throw.

## 5.19.3
Tue, 28 Jan 2020 01:35:53 GMT

_Version update only_

## 5.19.2
Tue, 28 Jan 2020 01:08:26 GMT

### Updates

- Fix an issue where the rushx command will always report error.
- Fixes "too many params" and "unable to find ref v<version>" issues in git tagging while publishing.

## 5.19.1
Sat, 25 Jan 2020 05:15:10 GMT

### Updates

- Fix an issue with install-run.js, where successful executions exit with a nonzero exit code.

## 5.19.0
Sat, 25 Jan 2020 04:19:23 GMT

### Updates

- Make the default branch and default remote configurable.
- Fix an issue where the Rush process terminates without any error message during installation/linking, due to a dependency package that broke its SemVer contract (GitHub #1713)
- Update package.json files without reformatting or reordering properties and fields during "rush add", "rush version" and "rush publish".
- Upgrade Node typings to Node 10
- Update the "rush init" .gitignore file to ignore .rush/temp and .DS_Store folders
- Improve command-line.json handling so that the "rush build" and "rush rebuild" commands can be extended without having to duplicate the built-in options (GitHub #1375)
- Add a --json flag for "rush list" to facilitate automation

## 5.18.0
Sat, 11 Jan 2020 05:38:55 GMT

### Updates

- Don't use the `build` verb when printing task failures
- Add a --commit command-line argument to the publish command to allow the git commit to be explicitly provided for tagging.
- Update GitHub project URL in some resource files
- fix typo in version-policies.json

## 5.17.2
Tue, 26 Nov 2019 00:53:52 GMT

### Updates

- Resolve an issue where git tags were not being applied when using pack or publish with --include-all

## 5.17.1
Thu, 21 Nov 2019 00:50:15 GMT

### Patches

- Remove an error thrown when the --registry and --pack arguments are used on rush publish, because --registry might be required to check if a package has already been published against a custom registry.
- Fix an issue with Rush add, where Rush was unable to add unpublished local projects as dependencies.

## 5.17.0
Thu, 14 Nov 2019 22:52:48 GMT

### Updates

- Add a new setting "implicitlyPreferredVersions" in common-versions.json that can be used to solve some installation failures involving peer dependencies
- Improve the generation of shrinkwrap-deps.json to consider optional peer dependencies and implicitlyPreferredVersions=false
- Fix an issue where certain operations did not use a stable sort when executed on older versions of NodeJS

## 5.16.1
Fri, 25 Oct 2019 20:15:59 GMT

### Updates

- Log to console instead of throwing when an unmet peer dependency is encountered during linking, and strictPeerDependencies is false
- Refactor some code as part of migration from TSLint to ESLint

## 5.16.0
Thu, 17 Oct 2019 00:41:01 GMT

### Updates

- Support PNPM 4 on Rush
- Add support for "rush add" for repos using the Yarn package manager.

## 5.15.1
Thu, 10 Oct 2019 23:47:19 GMT

### Updates

- Fix an issue where build commands can fail because git commands used to track changes can be too long.
- Fix compatibility issue where PNPM 4 requires --no-prefer-frozen-lockfile instead of --no-prefer-frozen-shrinkwrap

## 5.15.0
Tue, 08 Oct 2019 22:58:33 GMT

### Updates

- Improve 'rush build' to avoid rebuilding unnecessarily when the package-lock.json file has changed (pnpm only).

## 5.14.0
Wed, 02 Oct 2019 01:18:02 GMT

### Updates

- Add an --all flag to "rush add" to add a dependency to all projects.
- Add options to rush change to allow creating changefiles for all changed projects.
- Rush update now prints a message when the approved packages files are out-of-date, and rush install exits with an error if they are out-of-date.
- Include peerDependencies in the approved packages files.
- Make detection of changefiles and changes in projects safer.
- Update repository URL

## 5.13.1
Fri, 27 Sep 2019 22:34:50 GMT

### Updates

- Improve support for pnpm lockfile version 5.1. Also fixes a regression in Rush 5.12.0 in which rush install can fail on pnpm 3.5+ with the error message "ERROR: Invalid Version"

## 5.13.0
Wed, 11 Sep 2019 21:41:34 GMT

### Updates

- Add support for incremental custom commands. This change also adds a per-project `.rush/temp` folder that should be included in `.gitignore` (i.e. - `.rush/temp/**`).
- Add a --from-version-policy option for bulk commands to allow running the command (like build) from packages with a version policy and their direct and indirect dependent projects
- Update documentation
- Do not delete the pnpm store if an installation retry fails. Delete the pnpm store if and only if all the installation retry attempts fail.

## 5.12.1
Tue, 10 Sep 2019 19:45:15 GMT

### Updates

- Fix an issue where Rush attempted to add Git tags for packages that had already been published when the publish command is run with the --pack and --apply-git-tags-on-pack flags. This caused a fatal error when tags already existed.

## 5.12.0
Wed, 04 Sep 2019 19:01:42 GMT

### Updates

- Adding --apply-git-tags-on-pack flag to the publish command to apply git tags when using --pack
- For rush publish and rush version, change the path spec for git add to include everything from the repo root directory. This addresses https://github.com/microsoft/web-build-tools/issues/669.
- Add support for NPM package aliases (i.e. dependency versions such as "npm:example@^1.2.3")
- Fix an issue with rush change that occurs when rush.json isn't in the repository root.

## 5.11.4
Fri, 23 Aug 2019 03:31:52 GMT

### Updates

- Some optimizations for --to, --from, and cyclic dependency detection for repos with large numbers of projects.
- Ensure install-run-rushx script is updated during "rush update"

## 5.11.3
Wed, 21 Aug 2019 22:13:26 GMT

### Updates

- Add support for the RUSH_PREVIEW_VERSION environment variable to the install-run-rush script.
- Add support for the RUSH_TEMP_FOLDER environment variable in the install-run-rush script.
- Add install-run-rushx script to enable easy execution of the rushx command in CI

## 5.11.2
Fri, 16 Aug 2019 05:15:17 GMT

### Updates

- Refactor build action to allow generating build graph statically
- Security updates.
- Fix validation of hotfix changes in a hotfix-enabled branch
- Clarify that "rush update --full" should be run when changing certain settings

## 5.11.1
Fri, 26 Jul 2019 23:08:23 GMT

### Updates

- Fix critical path computation for projects
- Normalize the casing of a temp folder specified with RUSH_TEMP_FOLDER.

## 5.11.0
Fri, 26 Jul 2019 08:34:03 GMT

### Updates

- Generate skeleton BuildXL script modules for each package
- Allow building with newer versions of Node during development
- Add experimental rush-buildxl package
- Ensure the filesystem paths that Rush uses have the same character casing that exists on disk.
- Tweak NodeJS version warning messages and add suppressNodeLtsWarning option to rush.json to suppress non-LTS version warning.
- Do not terminate rush execution if a temp project lacks an entry in the PNPM shrinkwrap. Instead, allow the program to continue so that PNPM can update the outdated shrinkwrap. This fixes #1418 https://github.com/microsoft/web-build-tools/issues/1418.

## 5.10.3
Thu, 18 Jul 2019 00:07:46 GMT

### Updates

- Make event hooks run from the folder that contains the rush.json file.
- Fix 1392 "rush install not working on pnpm 3.5" by getting the temporary project dependency key from the shrinkwrap file. See  https://github.com/microsoft/web-build-tools/issues/1392.

## 5.10.2
Tue, 16 Jul 2019 19:36:08 GMT

### Updates

- Prevent non-hotfix changes from being applied to hotfix branches
- Use the shrinkwrap from temp for "rush link" as the committed shrinkwrap may not always be up to date as a result of shrinkwrap churn optimization. See https://github.com/microsoft/web-build-tools/issues/1273#issuecomment-492779995 for more details about shrinkwrap churn optimization.

## 5.10.1
Thu, 11 Jul 2019 22:00:50 GMT

### Updates

- Fix for issue https://github.com/microsoft/web-build-tools/issues/1349 rush install fails when there is a preferred version with a peer dependency. This was caused by file format changes in pnpm 3.x 
- Fix an issue where "rush add" erroneously believes ensureConsistentVersions is unset.
- Fix an issue that arises when "rush add" is run and the package manager isn't installed.
- Fix an issue where rush add -m doesn't corretly update the common-versions.json file.
- Fix an issue where rush change will detect unrelated changes.
- When rush change detects no changes, clarify that no *relevant* changes were detected in the case that changes were in a package not versioned by rush'
- Fix https://github.com/microsoft/web-build-tools/issues/1347: rush link was failing on pnpm 3+ with the changes in shrinkwrap format with regard to peer dependencies. Rush now resolves the path to the local project accurately by referring to the shrinkwrap rather than figuring out the path on its own.

## 5.10.0
Sat, 29 Jun 2019 02:47:42 GMT

### Updates

- New action added to list package name for all projects
- Add ability to opt out of changelog files for version policies.
- Workaround for pnpm issue 1890: https://github.com/pnpm/pnpm/issues/1890. Fixes the issue of "rush update --full" not working correctly if the internal copy of the pnpm shrinkwrap "common/temp/node_modules/.shrinkwrap.yaml" exists even though Rush deletes the formal copy in "common/temp/shrinkwrap.yaml".

## 5.9.1
Thu, 13 Jun 2019 04:46:18 GMT

### Updates

- Fix an issue where custom command-line parameters weren't passed to projects' builds.

## 5.9.0
Tue, 11 Jun 2019 02:26:20 GMT

### Updates

- (BEHAVIOR CHANGE) Fix an issue where CI jobs could succeed even if a task reported warnings to stderr; if your build fails due to warnings after upgrading, please see https://github.com/microsoft/web-build-tools/issues/1329

## 5.8.0
Tue, 11 Jun 2019 01:28:33 GMT

### Updates

- Add a new setting "ignoreDependencyOrder" in command-line.json
- Clarify "rush change" messages.
- Improve 'rush version' to fetch before checkout, which avoids an error in cases where the branch wasn't fetched.
- Fix typo in command-line help for "rush add"
- Fix an issue where "rush build" ignored changes to a project with an empty build script (GitHub #1282)

## 5.7.3
Mon, 06 May 2019 21:03:32 GMT

### Updates

- Allow colons in command line action names (add missing dependency from 5.7.2)

## 5.7.2
Mon, 06 May 2019 19:52:37 GMT

### Updates

- Allow colons in command line action names

## 5.7.1
Wed, 24 Apr 2019 06:32:17 GMT

### Updates

- Fix an issue where Rush sometimes failed to parse versions from PNPM 3.x's pnpm-lock.yaml
- Update the .gitattributes file written by "rush init" to use a better syntax highlighter for JSON files

## 5.7.0
Tue, 23 Apr 2019 07:55:34 GMT

### Updates

- Add support for PNPM version 3 (which changed the shrinkwrap file name to "pnpm-lock.yaml")
- Add a new rush.json setting "pnpmOptions.resolutionStrategy"

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

_Version update only_

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

_Version update only_

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

- Complete release notes are here: https://github.com/microsoft/web-build-tools/wiki#november-3-2017---rush-4-released
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

_Version update only_

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

_Initial release_

