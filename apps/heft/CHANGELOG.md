# Change Log - @rushstack/heft

This log was last generated on Wed, 16 Sep 2020 05:30:25 GMT and should not be manually modified.

## 0.13.2
Wed, 16 Sep 2020 05:30:25 GMT

### Patches

- Add missing "extends" properties to schemas.
- Fix an issue where console.log() did not get formatted by HeftJestReporter

## 0.13.1
Tue, 15 Sep 2020 01:51:37 GMT

### Patches

- Improve reliability of jest-build-transform.js by only comparing timestamps when in "--watch" mode

## 0.13.0
Mon, 14 Sep 2020 15:09:48 GMT

### Minor changes

- Enable support for Jest inline snapshots

## 0.12.0
Sun, 13 Sep 2020 01:53:20 GMT

### Minor changes

- Update plugins to load configuration via heft-configuration-loader instead of in central plugins.
- Remove the loading of common/config/heft/* config files.
- (BREAKING CHANGE) Rename the "outFolderPath" and "emitFolderPathForJest" properties in typescript.json to "outFolderName" and "emitFolderNameForJest"

## 0.11.1
Fri, 11 Sep 2020 02:13:35 GMT

*Version update only*

## 0.11.0
Wed, 09 Sep 2020 03:29:01 GMT

### Minor changes

- Add --max-workers option to the "test" action to control the maximum number of worker processes the test process can use.

## 0.10.5
Wed, 09 Sep 2020 00:38:48 GMT

### Patches

- Fix a typo in an error message to read that plugins must define a "pluginName" property, rather than the former "displayName" property

## 0.10.4
Mon, 07 Sep 2020 07:37:37 GMT

### Patches

- Fix an issue with WebpackPlugin loading webpack-dev-server in non-serve mode and setting the "WEBPACK_DEV_SERVER" environment variable.

## 0.10.3
Sat, 05 Sep 2020 18:56:35 GMT

### Patches

- Fix parsing of the --max-old-space-size build parameter.
- Fix parsing of the --plugin heft parameter.

## 0.10.2
Fri, 04 Sep 2020 15:06:27 GMT

### Patches

- Fix issues with parsing of tslint.json config files, including adding support for an array provided to "extends" and proper Node module resolution to extended config files.
- Fix a sourcemap issue that caused the debugger to show Jest files in a duplicate editor window (with the same path as the real file)

## 0.10.1
Thu, 03 Sep 2020 15:09:59 GMT

### Patches

- Fix an issue with Heft not printing an error message.

## 0.10.0
Wed, 02 Sep 2020 23:01:13 GMT

### Minor changes

- Add a simple way to specify a custom action.
- Remove the dev-deploy action from Heft

## 0.9.0
Wed, 02 Sep 2020 15:10:17 GMT

### Minor changes

- Add a method for plugins to hook into other plugins.
- BREAKING CHANGE: Rename the "displayName" plugin property to "pluginName"

## 0.8.0
Thu, 27 Aug 2020 11:27:06 GMT

### Minor changes

- Formalize the way extendable configuration files are loaded.
- Add a "setupFiles" setting to jest-shared.config.json, which implements the helper APIs from the @types/heft-jest package
- Add a "roots" setting to jest-shared.config.json, which enables "src/__mocks__" to be used for manually mocking Node.js system modules

### Patches

- Add a "modulePathIgnorePatterns" setting to jest-shared.config.json, which fixes a warning that was sometimes shown due to Jest loading extraneous files
- Add a "resolver" setting to jest-shared-config.json, which fixes an issue with importing manual mocks from a "__mocks__" subfolder. (See jest-improved-resolver.js for details.)

## 0.7.0
Tue, 25 Aug 2020 00:10:12 GMT

### Minor changes

- Adds a "--update-snapshots" command line flag which, when included, causes the test action to update the Jest snapshots. If this flag is omitted, tests with conditions that do not match the snapshots will fail. This replaces the older logic of using --production to prevent updating snapshots, which were otherwise updated.

## 0.6.6
Mon, 24 Aug 2020 07:35:20 GMT

*Version update only*

## 0.6.5
Sat, 22 Aug 2020 05:55:42 GMT

*Version update only*

## 0.6.4
Fri, 21 Aug 2020 01:21:17 GMT

### Patches

- Fix an issue with Heft exiting with exit code 0 after a CLI error.

## 0.6.3
Thu, 20 Aug 2020 18:41:47 GMT

### Patches

- Fix an issue where failed test suites aren't listed as failures.

## 0.6.2
Thu, 20 Aug 2020 15:13:52 GMT

### Patches

- Add the --notest parameter back to "heft test" temporarily.

## 0.6.1
Tue, 18 Aug 2020 23:59:42 GMT

*Version update only*

## 0.6.0
Tue, 18 Aug 2020 03:03:23 GMT

### Minor changes

- Add a "version selector" feature so that if a globally installed Heft binary is invoked, it will try to load the project's locally installed version of Heft

## 0.5.1
Mon, 17 Aug 2020 05:31:53 GMT

### Patches

- Fix a broken dependency

## 0.5.0
Mon, 17 Aug 2020 04:53:23 GMT

### Minor changes

- Formalize the way errors and warnings are emitted.
- Expose some useful Jest CLI parameters as "heft test" parameters
- Rename "--notest" to "--no--test"
- Improve "heft test" to show console output from tests

### Patches

- Normalize the way file paths are printed in errors and warnings.
- Ensure build steps that depend on emitted TS output aren't triggered until TS has written output to disk.
- Fix an issue where Heft could complete with errors but not return a nonzero process exit code
- Reclassify TypeScript messages such as "X is declared but never used" to be reported as warnings instead of errors

## 0.4.7
Thu, 13 Aug 2020 09:26:39 GMT

### Patches

- Fix a race condition where .js files were sometimes read by Jest before they were written by TypeScript
- Fix an issue where the TypeScript incremental build cache sometimes did not work correctly in "--watch" mode
- Add support for "additionalModuleKindsToEmit" in watch mode

## 0.4.6
Thu, 13 Aug 2020 04:57:38 GMT

### Patches

- Fix an issue with incorrect source maps for the Jest transform
- Fix a watch mode race condition where "--clean" ran in parallel with "heft test" (GitHub #2078)
- Fix an issue where "The transpiler output folder does not exist" was sometimes printed erroneously

## 0.4.5
Wed, 12 Aug 2020 00:10:05 GMT

*Version update only*

## 0.4.4
Tue, 11 Aug 2020 00:36:22 GMT

### Patches

- Fix an issue where emitted .js.map sourcemaps had an incorrect relative path (GitHub #2086)

## 0.4.3
Wed, 05 Aug 2020 18:27:33 GMT

*Version update only*

## 0.4.2
Tue, 04 Aug 2020 07:27:25 GMT

### Patches

- Update README.md logo

## 0.4.1
Mon, 03 Aug 2020 15:09:51 GMT

### Patches

- Add specific support for handling binary assets in Jest tests.

## 0.4.0
Mon, 03 Aug 2020 06:55:14 GMT

### Minor changes

- Add jest-identity-mock-transform for mocking .css imports in Webpack projects
- Add new "emitFolderPathForJest" setting in typescript.json, which simplifies how Webpack projects emit CommonJS for Jest

### Patches

- Fix an issue where jest-shared.config.json did not match .tsx file extensions
- Standardize how jest-shared.config.json references path-based imports
- Enable Jest "runInBand" when invoking Heft with "--debug"
- Fix an issue where "heft clean" did not clean Jest's unreliable cache

## 0.3.1
Thu, 30 Jul 2020 15:09:35 GMT

### Patches

- Emit errors and warnings from webpack.

## 0.3.0
Fri, 24 Jul 2020 20:40:38 GMT

### Minor changes

- Enable Heft to be used without the "@microsoft/rush-stack-compiler-n.n" system

## 0.2.2
Tue, 21 Jul 2020 00:54:55 GMT

### Patches

- Rename .heft/api-extractor.json to .heft/api-extractor-task.json to avoid confusion with API Extractor's config file

## 0.2.1
Tue, 21 Jul 2020 00:10:21 GMT

### Patches

- Update documentation

## 0.2.0
Mon, 20 Jul 2020 06:52:33 GMT

### Minor changes

- Make API Extractor's typescriptCompilerFolder option configurable.
- Include basic support for webpack-dev-server.

## 0.1.2
Thu, 16 Jul 2020 18:34:08 GMT

### Patches

- Republish to fix incorrect dependency specifier

## 0.1.1
Thu, 16 Jul 2020 17:53:35 GMT

### Patches

- Add support for TypeScript compilers older than version 3.6 (which do not support incremental compilation)

## 0.1.0
Wed, 15 Jul 2020 18:29:28 GMT

### Minor changes

- Initial release

