# Change Log - @microsoft/api-extractor

This log was last generated on Sat, 29 Jun 2019 02:30:10 GMT and should not be manually modified.

## 7.2.2
Sat, 29 Jun 2019 02:30:10 GMT

### Patches

- Fix GitHub issue #1304 where "IExtractorInvokeOptions.typescriptCompilerFolder" did not work with TypeScript 3.4

## 7.2.1
Wed, 12 Jun 2019 19:12:33 GMT

*Version update only*

## 7.2.0
Tue, 11 Jun 2019 00:48:06 GMT

### Minor changes

- Generate ApiTypeParameter entries and type alias types

## 7.1.8
Wed, 05 Jun 2019 19:12:34 GMT

### Patches

- Fix an issue where TSDoc index selectors (ApiParameterListMixin.overloadIndex) started from 0, whereas TSDoc requires a nonzero number

## 7.1.7
Tue, 04 Jun 2019 05:51:53 GMT

### Patches

- Upgrade api-extractor-model to remove ApiConstructor.isStatic, since TypeScript constructors cannot be static
- Improve handling of symbolic property and method names.

## 7.1.6
Mon, 27 May 2019 04:13:44 GMT

### Patches

- Fix incorrect path resolution for the "extends" field when loading tsconfig.json

## 7.1.5
Mon, 13 May 2019 02:08:35 GMT

### Patches

- Broaden support for default imports

## 7.1.4
Mon, 06 May 2019 20:46:21 GMT

*Version update only*

## 7.1.3
Mon, 06 May 2019 19:34:54 GMT

### Patches

- Add a new setting "omitTrimmingComments" to prevent extra comments from being emitted in the .d.ts rollup

## 7.1.2
Mon, 06 May 2019 19:11:16 GMT

### Patches

- Fix an issue where ExtractorResult.warningCount was not incremented for messages handled by IExtractorInvokeOptions.messageCallback (GitHub #1258)

## 7.1.1
Tue, 30 Apr 2019 23:08:02 GMT

### Patches

- Fix an issue where API signatures were sometimes truncated in the .api.json file (GitHub #1249)

## 7.1.0
Tue, 16 Apr 2019 11:01:37 GMT

### Minor changes

- Initial stable release of API Extractor 7

## 7.0.42
Fri, 12 Apr 2019 06:13:16 GMT

### Patches

- Fix a regression that prevented certain types of warnings from being reported

## 7.0.41
Thu, 11 Apr 2019 07:14:01 GMT

### Patches

- THIS IS A RELEASE CANDIDATE FOR API-EXTRACTOR 7
- (Breaking change) Rename "mainEntryPointFile" to "mainEntryPointFilePath" so all settings use a consistent naming convention
- (Breaking change) Paths that appear in api-extractor.json are now resolved relative to the config file unless prefixed with the `<projectFolder>` token
- Add a new api-extractor.json setting "tsconfigFilePath" for customizing the tsconfig.json path
- Replace ExtractorConfig.packageJsonFullPath with ExtractorConfig.packageFolder
- Upgrade API Extractor to use TypeScript 3.4 for analysis

## 7.0.40
Tue, 09 Apr 2019 05:31:01 GMT

### Patches

- Improve the "--local" option to automatically create the API report file if it is missing

## 7.0.39
Mon, 08 Apr 2019 19:12:52 GMT

### Patches

- Rename "addToApiReviewFile" setting to "addToApiReportFile"

## 7.0.38
Sat, 06 Apr 2019 02:05:51 GMT

### Patches

- (Breaking change) Removed the ILogger API and renamed ExtractorMessageLogLevel to ExtractorLogLevel
- (Breaking change) Extractor console output is now modeled as ExtractorMessage objects and can be customized/filtered/handled by IExtractorInvokeOptions.messageCallback

## 7.0.37
Fri, 05 Apr 2019 04:16:16 GMT

### Patches

- Introduce "api-extractor init" command-line that helps enable API Extractor for a new project
- (Breaking change) Major redesign of the API used to invoke API Extractor
- (Breaking change) Major redesign of the api-extractor.json config file format
- Add a CompilerState API that allows an optimization where multiple invocations of Extractor can reuse the same TypeScript compiler analysis

## 7.0.36
Wed, 03 Apr 2019 02:58:33 GMT

### Patches

- Fix an issue where .d.ts.map file were sometimes mapped to the wrong location

## 7.0.35
Sat, 30 Mar 2019 22:27:16 GMT

### Patches

- Reintroduce the generated documentation notice for internal constructors
- Add limited support for resolving @inheritDoc references to external packages by postprocessing them in api-documenter

## 7.0.34
Thu, 28 Mar 2019 19:14:27 GMT

### Patches

- Validate `@link` tags and report a warning if the link cannot be resolved

## 7.0.33
Tue, 26 Mar 2019 20:54:18 GMT

### Patches

- Reintroduce support for `@inheritDoc` tags

## 7.0.32
Sat, 23 Mar 2019 03:48:31 GMT

### Patches

- If the TSDoc summary is missing for a class constructor, then automatically generate it
- Reintroduce support for the `@preapproved` TSDoc tag

## 7.0.31
Thu, 21 Mar 2019 04:59:11 GMT

### Patches

- Reintroduce "ae-internal-missing-underscore" warning for API items marked as `@internal` but whose name does not start with an underscore

## 7.0.30
Thu, 21 Mar 2019 01:15:32 GMT

### Patches

- Improve the API review file generation to include imports and support multiple exports

## 7.0.29
Wed, 20 Mar 2019 19:14:49 GMT

### Patches

- API Extractor can now analyze packages whose package.json file is missing the "version" field

## 7.0.28
Mon, 18 Mar 2019 04:28:43 GMT

### Patches

- Rename the "ae-inconsistent-release-tags" warning to "ae-different-release-tags"
- Introduce a new warning "ae-incompatible-release-tags" that checks for API signatures that reference types with incompatible release tags
- Fix an issue where this error was sometimes reported incorrectly: "The messages.extractorMessageReporting table contains an unrecognized identifier ___"

## 7.0.27
Fri, 15 Mar 2019 19:13:25 GMT

### Patches

- (Breaking change) The file extension for API review files has changed from ".api.ts" to "api.md".  For details see https://github.com/Microsoft/web-build-tools/issues/1123

## 7.0.26
Wed, 13 Mar 2019 19:13:14 GMT

### Patches

- Refactor code to move the IndentedWriter API from api-extractor-model to api-documenter

## 7.0.25
Wed, 13 Mar 2019 01:14:05 GMT

### Patches

- Upgrade TSDoc

## 7.0.24
Mon, 11 Mar 2019 16:13:36 GMT

### Patches

- Fix an issue where spurious TSDoc warnings were issued because the TSDoc parser was configured improperly
- Move the .api.json related APIs into a new NPM package @microsoft/api-extractor-model

## 7.0.23
Tue, 05 Mar 2019 17:13:11 GMT

### Patches

- Issue a warning when an exported type refers to another local type that is not exported (ae-forgotten-export)
- The export analyzer now correctly handles symbols imported using "import x = require('y');" notation

## 7.0.22
Mon, 04 Mar 2019 17:13:19 GMT

### Patches

- Every error/warning message reported by API Extractor now has an associated message identifier
- Add a new section to api-extractor.json for configuring how errors get reported, with ability to suppress individual errors
- Reintroduce the ability to report issues by writing warnings into the API review file
- Fix an issue where members of type literals were incorrectly being flagged as "(undocumented)"
- Error messages now cite the original .ts source file, if a source map is present. (To enable this, specify `"declarationMap": true` in tsconfig.json.)

## 7.0.21
Wed, 27 Feb 2019 22:13:58 GMT

*Version update only*

## 7.0.20
Wed, 27 Feb 2019 17:13:17 GMT

*Version update only*

## 7.0.19
Mon, 18 Feb 2019 17:13:23 GMT

### Minor changes

- New way to resolve & generate TSDoc metadata file

## 7.0.18
Tue, 12 Feb 2019 17:13:12 GMT

### Patches

- Add a workaround for the issue where .d.ts rollups sometimes define names that conflict with a global symbol (the full solution is tracked by GitHub #1095)

## 7.0.17
Mon, 11 Feb 2019 10:32:37 GMT

### Patches

- Fix an issue where API Extractor neglected to analyze "typeof" expressions
- Fix an issue where declarations inside a namespace were sometimes being incorrectly emitted as top-level exports of the .d.ts rollup

## 7.0.16
Mon, 11 Feb 2019 08:55:57 GMT

### Patches

- Redesign the analyzer so that when an external symbol is reexported by the working package, the local object (AstImport) and external object (AstSymbol) are kept separate
- Fix a number of bugs where external symbols were misinterpreted as being part of the local project
- Eliminate a number of errors involving unusual language constructs, by avoiding analysis of external symbols unless it's really necessary
- Simplify the AstSymbol.nominalAnalysis concept and associated code
- Improve .d.ts rollup trimming to handle reexported symbols correctly

## 7.0.15
Mon, 11 Feb 2019 03:31:55 GMT

### Patches

- The `--debug` parameter now automatically breaks in the debugger when InternalError is thrown

## 7.0.14
Thu, 31 Jan 2019 17:03:49 GMT

### Patches

- Upgrade to TSDoc 0.12.5, which allows `$` in `@param` names
- Add "testMode" option in api-extractor.json to eliminate spurious diffs in test files when the version number gets bumped
- Normalize newlines for excerpt strings in the .api.json file

## 7.0.13
Sat, 19 Jan 2019 03:47:47 GMT

### Patches

- Move the skipLibCheck into the config file.

## 7.0.12
Sat, 19 Jan 2019 01:17:51 GMT

### Patches

- Fix an issue where files using "export=" were incorrectly interpreted as having ambient declarations

## 7.0.11
Fri, 18 Jan 2019 00:52:21 GMT

### Patches

- Add support for circular references between files that use `export * from "____";`

## 7.0.10
Thu, 17 Jan 2019 00:37:54 GMT

### Patches

- Add support for exports of the form `export * from "____";`
- Improve the analyzer to allow a declaration to be exported more than once
- Fix inconsistent newlines in .api.ts files

## 7.0.9
Thu, 10 Jan 2019 01:57:52 GMT

### Patches

- Fix an issue with rolling up default exports (https://github.com/Microsoft/web-build-tools/issues/1007)

## 7.0.8
Thu, 20 Dec 2018 17:04:08 GMT

### Patches

- Fix an issue where it was possible to import forgotten declarations from a .d.ts rollup, even though they did not have an explicit "export" modifier

## 7.0.7
Wed, 19 Dec 2018 05:57:33 GMT

### Patches

- Extend ApiModel to support new item kinds: ApiCallSignature, ApiConstructor, ApiConstructSignature, ApiFunction, ApiIndexSignature, ApiTypeAlias, and ApiVariable

## 7.0.6
Fri, 14 Dec 2018 19:43:46 GMT

### Patches

- Update web site URLs

## 7.0.5
Thu, 13 Dec 2018 02:58:10 GMT

### Patches

- Remove unused jju dependency

## 7.0.4
Wed, 12 Dec 2018 17:04:19 GMT

### Patches

- Reintroduce support for "extends" and "implements" heritage clauses
- Redesign the Excerpt API to support multiple subranges (e.g. for a list of "implements" clauses)

## 7.0.3
Fri, 07 Dec 2018 17:04:56 GMT

### Patches

- Added more API documentation

## 7.0.2
Wed, 05 Dec 2018 19:57:03 GMT

### Patches

- fix reexported types from an external package for dts rollup

## 7.0.1
Wed, 05 Dec 2018 17:04:18 GMT

### Patches

- Fix an issue where .d.ts trimming did not properly handle variable declarations (GitHub #976)

## 7.0.0
Thu, 29 Nov 2018 07:02:09 GMT

### Breaking changes

- THIS IS A BETA RELEASE - We are bumping the version to "7.0.0" to simplify dogfooding. This release is not yet ready for general usage.

## 6.3.0
Wed, 28 Nov 2018 19:29:53 GMT

### Minor changes

- Support "extends" field in api-extractor.json config files for easier management of monorepos with many projects

## 6.2.0
Wed, 28 Nov 2018 02:17:11 GMT

### Minor changes

- Introduce a new build output "dist/tsdoc-metdata.json", which completely replaces the old "tsdocFlavor" field in package.json

## 6.1.6
Fri, 16 Nov 2018 21:37:10 GMT

### Patches

- Add support for emitting `/// <reference lib="___" />` directives in .d.ts rollups (GitHub issue #946)

## 6.1.5
Fri, 16 Nov 2018 00:59:00 GMT

### Patches

- Fix an issue where .d.ts trimming did not work for exported variable declarations (GitHub #936)

## 6.1.4
Fri, 09 Nov 2018 23:07:39 GMT

### Patches

- Upgrade to TSDoc 0.21.2, which improves trimming of link text in `@link` tags

## 6.1.3
Wed, 07 Nov 2018 21:04:35 GMT

*Version update only*

## 6.1.2
Mon, 05 Nov 2018 17:04:24 GMT

### Patches

- Upgrade to @microsoft/tsdoc 0.12.0

## 6.1.1
Thu, 01 Nov 2018 19:32:52 GMT

### Patches

- Fix an issue where EcmaScript symbols ("computed property names") were missing from .d.ts rollups

## 6.1.0
Wed, 31 Oct 2018 17:00:54 GMT

### Minor changes

- Added an api to invoke api extractor processor by supplying api extractor json config file.

## 6.0.9
Thu, 25 Oct 2018 23:20:40 GMT

*Version update only*

## 6.0.8
Thu, 25 Oct 2018 08:56:02 GMT

### Patches

- Fix issue where `DocErrorText.text` returned `[object Object]` instead of the text 

## 6.0.7
Wed, 24 Oct 2018 16:03:10 GMT

*Version update only*

## 6.0.6
Thu, 18 Oct 2018 01:32:20 GMT

### Patches

- Fix isAbsolute check for mainDtsRollupPath

## 6.0.5
Wed, 17 Oct 2018 21:04:49 GMT

*Version update only*

## 6.0.4
Wed, 17 Oct 2018 14:43:24 GMT

### Patches

- Fix a regression where namespaces were sometimes incorrectly handled in "conservative" mode
- Update the command line to look for api-extractor.json in both the "./config" folder and the project folder
- Allow type references in namespaces when namespaceSupport=conservative

## 6.0.3
Thu, 11 Oct 2018 23:26:07 GMT

### Patches

- Fix an issue where `import x from "."` was sometimes not processed correctly

## 6.0.2
Tue, 09 Oct 2018 06:58:01 GMT

### Patches

- Fix a regression where API Extractor was sometimes reporting incorrect line numbers

## 6.0.1
Mon, 08 Oct 2018 16:04:27 GMT

*Version update only*

## 6.0.0
Sun, 07 Oct 2018 06:15:56 GMT

### Breaking changes

- (Breaking change) API Extractor 6 introduces support for TSDoc doc comment syntax!  Please see https://api-extractor.com/ for documentation.  To learn more about the TSDoc standard, check out https://github.com/Microsoft/tsdoc

## 5.13.1
Fri, 28 Sep 2018 16:05:35 GMT

*Version update only*

## 5.13.0
Wed, 26 Sep 2018 21:39:40 GMT

### Minor changes

- Add new command line option --skip-lib-check

## 5.12.2
Mon, 24 Sep 2018 23:06:40 GMT

### Patches

- Allow doc comments to use TSDoc's "@defaultvalue" tag (but the value is not yet passed to the documentation pipeline)

## 5.12.1
Fri, 21 Sep 2018 16:04:42 GMT

### Patches

- Fix an issue where TypeScript errors are often logged as "[Object object]" instead of the actual error message.

## 5.12.0
Thu, 20 Sep 2018 23:57:21 GMT

### Minor changes

- Add new feature: Support using a different version of the TypeScript compiler.

## 5.11.2
Tue, 18 Sep 2018 21:04:55 GMT

### Patches

- Fix an issue where parameters mentioned in comments were attempting to be analyzed by api-extractor.

## 5.11.1
Thu, 06 Sep 2018 01:25:25 GMT

### Patches

- Update "repository" field in package.json

## 5.11.0
Mon, 03 Sep 2018 16:04:45 GMT

### Minor changes

- Upgrade api-extractor to internally use TypeScript 3.0.

## 5.10.8
Wed, 29 Aug 2018 06:36:50 GMT

*Version update only*

## 5.10.7
Thu, 23 Aug 2018 18:18:53 GMT

### Patches

- Republish all packages in web-build-tools to resolve GitHub issue #782

## 5.10.6
Wed, 22 Aug 2018 20:58:58 GMT

*Version update only*

## 5.10.5
Wed, 22 Aug 2018 16:03:25 GMT

*Version update only*

## 5.10.4
Tue, 21 Aug 2018 16:04:38 GMT

### Patches

- fix namespace name for export statement`

## 5.10.3
Thu, 09 Aug 2018 21:03:22 GMT

*Version update only*

## 5.10.2
Thu, 09 Aug 2018 16:04:24 GMT

### Patches

- Update lodash.

## 5.10.1
Thu, 26 Jul 2018 16:04:17 GMT

*Version update only*

## 5.10.0
Tue, 17 Jul 2018 16:02:52 GMT

### Minor changes

- Add support for new "@eventproperty" AEDoc tag, which indicates that a class/interface property should be documented as an event

## 5.9.1
Tue, 03 Jul 2018 21:03:31 GMT

*Version update only*

## 5.9.0
Sat, 23 Jun 2018 02:21:20 GMT

### Minor changes

- Add new IMarkupHtmlTag API
- AEDoc now allows HTML tags inside doc comments, which can be disabled using a backslash escape

## 5.8.1
Thu, 21 Jun 2018 08:27:29 GMT

*Version update only*

## 5.8.0
Tue, 19 Jun 2018 19:35:11 GMT

### Minor changes

- For namespaceSupport=permissive, allow arbitrary nesting of namespaces

### Patches

- Fix an issue where multi-line type literals sometimes had inconsistent newlines in the *.api.json file

## 5.7.3
Fri, 08 Jun 2018 08:43:52 GMT

*Version update only*

## 5.7.2
Thu, 31 May 2018 01:39:33 GMT

*Version update only*

## 5.7.1
Tue, 15 May 2018 02:26:45 GMT

*Version update only*

## 5.7.0
Tue, 15 May 2018 00:18:10 GMT

### Minor changes

- Add support for new AEDoc tags @sealed, @virtual, and @override

## 5.6.8
Fri, 04 May 2018 00:42:38 GMT

### Patches

- Fix the formatting of a log message.

## 5.6.7
Tue, 01 May 2018 22:03:20 GMT

### Patches

- Fix an issue where the *.d.ts rollup trimming did not trim import statements

## 5.6.6
Fri, 27 Apr 2018 03:04:32 GMT

*Version update only*

## 5.6.5
Thu, 19 Apr 2018 21:25:56 GMT

*Version update only*

## 5.6.4
Thu, 19 Apr 2018 17:02:06 GMT

### Patches

- Fix errors in schema documentation

## 5.6.3
Tue, 03 Apr 2018 16:05:29 GMT

*Version update only*

## 5.6.2
Mon, 02 Apr 2018 16:05:24 GMT

### Patches

- Refactor to use new @microsoft/node-core-library

## 5.6.1
Tue, 27 Mar 2018 01:34:25 GMT

### Patches

- Update build config so API Extractor builds using the latest version of itself

## 5.6.0
Sun, 25 Mar 2018 01:26:19 GMT

### Minor changes

- Improve the api-extractor.json config file so that *.d.ts rollups go in separate folders, and trimming can now be disabled

### Patches

- In preparation for initial release, the "Package Typings" feature was renamed to "DTS Rollup"
- Fix an issue where the @packagedocumentation comment was sometimes getting mixed into the middle of the rollup *.d.ts file

## 5.5.2
Fri, 23 Mar 2018 00:34:53 GMT

### Patches

- Upgrade colors to version ~1.2.1

## 5.5.1
Tue, 20 Mar 2018 02:44:45 GMT

### Patches

- Improve packageTypings generator to trim nested members according to their release tag
- Fix a bug where packageTypings failed to handle merged declarations properly

## 5.5.0
Sat, 17 Mar 2018 02:54:22 GMT

### Minor changes

- Overhaul the packageTypings generator analysis to get ready for the upcoming nested member trimming
- Breaking change: Any projects using the package typings feature must now have a "tsdoc" section in their package.json

### Patches

- Add "--debug" flag for debugging

## 5.4.0
Thu, 15 Mar 2018 20:00:50 GMT

### Minor changes

- Add a new setting validationRules.missingReleaseTags to optionally remove the requirement that every API item should have a release tag
- Add new API "Markup.formatApiItemReference()"

### Patches

- Fix an issue where the automatically generated documentation for class constructors sometimes had a broken hyperlink

## 5.3.9
Thu, 15 Mar 2018 16:05:43 GMT

*Version update only*

## 5.3.8
Mon, 12 Mar 2018 20:36:19 GMT

### Patches

- Locked down some "@types/" dependency versions to avoid upgrade conflicts

## 5.3.7
Tue, 06 Mar 2018 17:04:51 GMT

### Patches

- Add preliminary support for preview and public outputs for packageTypings generator

## 5.3.6
Fri, 02 Mar 2018 01:13:59 GMT

*Version update only*

## 5.3.5
Tue, 27 Feb 2018 22:05:57 GMT

*Version update only*

## 5.3.4
Wed, 21 Feb 2018 22:04:19 GMT

*Version update only*

## 5.3.3
Wed, 21 Feb 2018 03:13:28 GMT

*Version update only*

## 5.3.2
Sat, 17 Feb 2018 02:53:49 GMT

### Patches

- Fix several bugs with the way that imports were being deduplicated by the packageTypings feature

## 5.3.1
Fri, 16 Feb 2018 22:05:23 GMT

*Version update only*

## 5.3.0
Fri, 16 Feb 2018 17:05:11 GMT

### Minor changes

- Fix an issue where the packageTypings feature didn't handle some import/export patterns

### Patches

- Fix an issue where the packageTypings feature sometimes emitted "default" instead of the class name
- Improve the packageTypings feature to support triple-slash references to typings

## 5.2.7
Wed, 07 Feb 2018 17:05:11 GMT

*Version update only*

## 5.2.6
Fri, 26 Jan 2018 22:05:30 GMT

*Version update only*

## 5.2.5
Fri, 26 Jan 2018 17:53:38 GMT

### Patches

- Force a patch bump in case the previous version was an empty package

## 5.2.4
Fri, 26 Jan 2018 00:36:51 GMT

*Version update only*

## 5.2.3
Tue, 23 Jan 2018 17:05:28 GMT

*Version update only*

## 5.2.2
Thu, 18 Jan 2018 03:23:46 GMT

### Patches

- Enable package typings generated by api-extractor

## 5.2.1
Thu, 18 Jan 2018 00:48:06 GMT

*Version update only*

## 5.2.0
Thu, 18 Jan 2018 00:27:23 GMT

### Minor changes

- Improve the packageTypings feature to support abstract classes and "import * as X" imports

## 5.1.3
Wed, 17 Jan 2018 10:49:31 GMT

*Version update only*

## 5.1.2
Fri, 12 Jan 2018 03:35:22 GMT

### Patches

- Add some incremental improvements for the experimental PackageTypingsGenerator feature

## 5.1.1
Thu, 11 Jan 2018 22:31:51 GMT

*Version update only*

## 5.1.0
Wed, 10 Jan 2018 20:40:01 GMT

### Minor changes

- Upgrade to Node 8

### Patches

- Continued progress for the experimental PackageTypingsGenerator

## 5.0.1
Tue, 09 Jan 2018 17:05:51 GMT

### Patches

- Get web-build-tools building with pnpm

## 5.0.0
Sun, 07 Jan 2018 05:12:08 GMT

### Breaking changes

- API Extractor now processes *.d.ts files instead of *.ts files

### Minor changes

- Introduced new tag @packagedocumentation which replaces the earlier approach that used a "packageDescription" variable

## 4.3.7
Fri, 05 Jan 2018 20:26:45 GMT

*Version update only*

## 4.3.6
Fri, 05 Jan 2018 00:48:41 GMT

### Patches

- Update Jest to ~21.2.1

## 4.3.5
Fri, 22 Dec 2017 17:04:46 GMT

### Patches

- Fixed an issue where warnings would cause the api-extractor tool to return a nonzero exit code for a "--local" build; warnings should not fail the build in this scenario

## 4.3.4
Tue, 12 Dec 2017 03:33:26 GMT

*Version update only*

## 4.3.3
Thu, 30 Nov 2017 23:59:09 GMT

*Version update only*

## 4.3.2
Thu, 30 Nov 2017 23:12:21 GMT

*Version update only*

## 4.3.1
Wed, 29 Nov 2017 17:05:37 GMT

*Version update only*

## 4.3.0
Tue, 28 Nov 2017 23:43:55 GMT

### Minor changes

- Add Extractor.processProject() whose return value indicates success

### Patches

- Deprecate Extractor.analyzeProject() API

## 4.2.6
Mon, 13 Nov 2017 17:04:50 GMT

*Version update only*

## 4.2.5
Mon, 06 Nov 2017 17:04:18 GMT

*Version update only*

## 4.2.4
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 4.2.3
Wed, 01 Nov 2017 21:06:08 GMT

### Patches

- Upgrade cyclic dependencies

## 4.2.2
Tue, 31 Oct 2017 21:04:04 GMT

*Version update only*

## 4.2.1
Tue, 31 Oct 2017 16:04:55 GMT

*Version update only*

## 4.2.0
Wed, 25 Oct 2017 20:03:59 GMT

### Minor changes

- Improved the way API JSON represents documentation markup; this is a file format change

## 4.1.2
Tue, 24 Oct 2017 18:17:12 GMT

*Version update only*

## 4.1.1
Mon, 23 Oct 2017 21:53:12 GMT

### Patches

- Updated cyclic dependencies

## 4.1.0
Fri, 20 Oct 2017 19:57:12 GMT

### Minor changes

- Add policies.namespaceSupport option to API Extractor config

### Patches

- Fixed an issue where properties were sometimes marked as readonly; a remark is automatically generated for classes with internal constructors

## 4.0.1
Fri, 20 Oct 2017 01:52:54 GMT

### Patches

- Rename ApiExtractor class to Extractor

## 4.0.0
Fri, 20 Oct 2017 01:04:44 GMT

### Breaking changes

- Redesigned interface for invoking API Extractor

## 3.4.2
Thu, 05 Oct 2017 01:05:02 GMT

*Version update only*

## 3.4.1
Fri, 29 Sep 2017 01:03:42 GMT

### Patches

- Removed IMarkupPage.docId

## 3.4.0
Thu, 28 Sep 2017 01:04:28 GMT

### Minor changes

- Skipping two lines in an AEDoc comment now creates a paragraph separator for the generated documentation

### Patches

- The *.api.json "linkDocElement" type now always explicitly specifies the package name, rather than expecting the reader to infer it
- The *.api.json file format now exposes "signature" information for properties, functions, and module variables

## 3.3.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 3.2.6
Wed, 20 Sep 2017 22:10:17 GMT

*Version update only*

## 3.2.5
Mon, 11 Sep 2017 13:04:55 GMT

### Patches

- The isBeta and deprecatedMessage fields are now inherited in the *.api.json files
- Fix an issue where the *.api.json file was sometimes missing function parameters

## 3.2.4
Fri, 08 Sep 2017 01:28:04 GMT

### Patches

- Deprecate @types/es6-coll ections in favor of built-in typescript typings 'es2015.collection' a nd 'es2015.iterable'

## 3.2.3
Thu, 07 Sep 2017 13:04:35 GMT

### Patches

- Fix incorrect schema/typings for enum members

## 3.2.2
Thu, 07 Sep 2017 00:11:11 GMT

### Patches

-  Add $schema field to all schemas

## 3.2.1
Wed, 06 Sep 2017 13:03:42 GMT

### Patches

- Converted IMarkupDocumentationLink to IMarkupApiLink, which exposes the underlying IApiItemReference rather than assuming a particular "document ID" model

## 3.2.0
Tue, 05 Sep 2017 19:03:56 GMT

### Minor changes

- Add the constructor signature and package name to the exported API signature

## 3.1.0
Sat, 02 Sep 2017 01:04:26 GMT

### Minor changes

- Expanded the api-extractor API to expose interfaces for the *.api.json file fileformat

## 3.0.0
Thu, 31 Aug 2017 18:41:18 GMT

### Breaking changes

- Fix compatibility issues with old releases, by incrementing the major version number

## 2.3.7
Thu, 31 Aug 2017 17:46:25 GMT

### Patches

- Fix issue where node-core-library was not an explicit dependency

## 2.3.6
Wed, 30 Aug 2017 01:04:34 GMT

*Version update only*

## 2.3.5
Thu, 24 Aug 2017 22:44:12 GMT

### Patches

- Update the schema validator.

## 2.3.4
Thu, 24 Aug 2017 01:04:33 GMT

*Version update only*

## 2.3.3
Tue, 22 Aug 2017 13:04:22 GMT

### Patches

- Added "api-documenter" code sample

## 2.3.2
Tue, 15 Aug 2017 01:29:31 GMT

### Patches

- Introduce Span parser for upcoming *.d.ts generator

## 2.3.1
Thu, 27 Jul 2017 01:04:48 GMT

### Patches

- Upgrade to the TS2.4 version of the build tools.

## 2.3.0
Tue, 25 Jul 2017 20:03:31 GMT

### Minor changes

- Upgrade to TypeScript 2.4

## 2.2.0
Wed, 21 Jun 2017 04:19:35 GMT

### Minor changes

- Add two new features: An error is reported if a top-level definition is missing its release tag. The constructor summary will now be autogenerated if omitted.

## 2.0.10
Tue, 20 Jun 2017 01:04:54 GMT

### Patches

- Improve the wording of many error messages
- Fix a bug with parsing of @link tags
- Issue warnings for @internal definitions that are not prefixed with an underscore

## 2.0.9
Sat, 17 Jun 2017 01:02:59 GMT

### Patches

- The unsupported @summary tag is now reported as an error
- Use a cache to speed up package.json lookups

## 2.0.8
Wed, 14 Jun 2017 13:03:40 GMT

### Patches

- Definitions marked as @beta are now included in the *.api.json files for documentation

## 2.0.7
Thu, 08 Jun 2017 05:15:52 GMT

### Patches

- Updated README.md

## 2.0.6
Mon, 15 May 2017 21:59:43 GMT

### Patches

- Added support for Namespace with ApiNamespace

## 2.0.5
Sat, 22 Apr 2017 01:02:03 GMT

### Patches

- Added check for API names that are not supported (only letters and numbers supported)

## 2.0.4
Wed, 19 Apr 2017 20:18:06 GMT

### Patches

- Remove ES6 Promise & @types/es6-promise typings

## 2.0.3
Fri, 14 Apr 2017 17:44:08 GMT

### Patches

- Added collect references ability to detect determine type information of return types and parameter types.

## 2.0.2
Fri, 07 Apr 2017 21:43:16 GMT

### Patches

- Adjusted the version specifier for typescript to ~2.2.2

## 2.0.1
Thu, 06 Apr 2017 01:32:23 GMT

### Patches

- Removed hard coding of @public for ApiPackage

## 2.0.0
Mon, 20 Mar 2017 21:52:20 GMT

### Breaking changes

- Fixing whitespace, also a variable that was shadowing another variable.

## 1.1.19
Mon, 20 Mar 2017 04:20:13 GMT

### Patches

- Reverting change.

## 1.1.18
Mon, 20 Mar 2017 03:50:55 GMT

### Patches

- Reverting previous change, which causes a regression in SPFx yeoman sc enario.

## 1.1.17
Mon, 20 Mar 2017 00:54:03 GMT

### Patches

- Fixing lint whitespace issues.

## 1.1.16
Sun, 19 Mar 2017 19:10:30 GMT

### Patches

- Fixing variable that was shadowing another variable.

## 1.1.15
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 1.1.14
Sat, 18 Feb 2017 02:32:06 GMT

### Patches

- Seperated the ApiItem initialization into 3 stages: create documentation that doesn't require resolution, then complete initialization by resolving links and inheritdocs. This allows us to ignore harmless cycles like type references"

## 1.1.13
Thu, 16 Feb 2017 22:10:39 GMT

### Patches

- Fixed Api-Extractor error message, changed apostrophe to backtick.

## 1.1.12
Thu, 16 Feb 2017 18:56:57 GMT

### Patches

- Added support for local API definition resolution"

## 1.1.11
Sat, 11 Feb 2017 02:32:35 GMT

### Patches

- Changed dependency for ApiDocumentation to abstract the resolving of API definition references.

## 1.1.10
Fri, 10 Feb 2017 20:01:30 GMT

### Patches

-  Added support to not throw error, instead report error if no type is declared on properties and parameters

## 1.1.9
Tue, 07 Feb 2017 20:37:06 GMT

### Patches

- Fixing issue where undocumented comment was not being emitted.

## 1.1.8
Sat, 04 Feb 2017 02:32:05 GMT

### Patches

- Moved ApiItem references within ApiDocumentation, to ApiItem caller.

## 1.1.7
Thu, 02 Feb 2017 14:05:53 GMT

### Patches

- Refactored ApiDocumentation creation to resolve references method.

## 1.1.6
Wed, 01 Feb 2017 20:09:30 GMT

### Patches

- Added ApiItemKind enum and refactored child classes.

## 1.1.5
Fri, 27 Jan 2017 20:04:15 GMT

### Patches

- Changed name of Analyzer to Extractor, added support for external api json doc loading.

## 1.1.4
Fri, 27 Jan 2017 02:35:10 GMT

### Patches

- Added ExternalApiHelper class to be used in generating api documentation json files for external types.
- Added description for packages implementation.
- Added config folder with file to enable api-extractor on itself. rebuild project on previous build.

## 1.1.3
Tue, 24 Jan 2017 01:36:35 GMT

### Patches

- Json schema was updated to reflect feature additions to linkDocElement. The linkDocElement can now be of type 'code' which refers to an API definition reference.

## 1.1.2
Fri, 20 Jan 2017 01:46:41 GMT

*Version update only*

## 1.1.1
Thu, 19 Jan 2017 20:04:40 GMT

### Patches

- Check for missing JSDoc sequences changed.
- Improved error messages

## 1.1.0
Wed, 18 Jan 2017 20:04:29 GMT

### Minor changes

- Updating API Extractor to work with TypeScript 2.1

## 1.0.2
Mon, 16 Jan 2017 20:04:15 GMT

### Patches

- @link capability for href and API definition references

## 1.0.1
Fri, 13 Jan 2017 06:46:05 GMT

*Version update only*

## 1.0.0
Wed, 11 Jan 2017 14:11:26 GMT

### Breaking changes

- Introducing API Extractor

