// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * With this configuration, API Extractor configures the compiler based on settings that
 * it finds in the project's tsconfig.json file.
 *
 * @public
 */
export interface IExtractorTsconfigCompilerConfig {
  configType: 'tsconfig';

  /**
   * The root folder for the project.
   * @remarks
   * This folder typically contains the tsconfig.json and package.json config files.
   */
  rootFolder: string;

  /**
   * Override the tsconfig.json file contents.
   *
   * @remarks
   * Provides already parsed tsconfig.json contents conforming to the TypeScript tsconfig schema:
   * http://json.schemastore.org/tsconfig
   *
   * If omitted, then by default the tsconfig.json file will be loaded from the root folder.
   */
  overrideTsconfig?: { };
}

/**
 * With this configuration, API Extractor is configured using an already prepared compiler state
 * that is provided programmatically at runtime.  This can potentially enable faster builds,
 * by reusing the same compiler invocation for tsc, tslint, and API Extractor.
 *
 * If configType='runtime' is specified, then IExtractorRuntimeOptions.compilerProgram must be
 * provided.
 *
 * @public
 */
export interface IExtractorRuntimeCompilerConfig {
  configType: 'runtime';
}

/**
 * Describes a specific project that will be analyzed.  In principle, multiple individual
 * projects can be processed while reusing a common compiler state.
 *
 * @public
 */
export interface IExtractorProjectConfig {
  /**
   * Specifies the TypeScript *.d.ts file that will be treated as the entry point
   * for compilation.  Typically this corresponds to the "typings" or "types" field
   * from package.json, but secondary entry points are also possible.
   *
   * @remarks
   * The file extension must not be *.ts.  API Extractor does NOT process TypeScript
   * source code, but instead the output of the compiler.  This is needed for compatibility
   * with preprocessors and also custom tooling that produces TypeScript-compatible outputs
   * without using the real compiler.  It also speeds up the analysis by avoiding the
   * need to parse implementation code.
   */
  entryPointSourceFile: string;
}

/**
 * These policies determine how API Extractor validates various best practices for API design.
 *
 * @public
 */
export interface IExtractorPoliciesConfig {
  /**
   * Controls how API Extractor treats the TypeScript namespace keyword:
   *
   * conservative - (the default) namespaces may only be used to represent tables of constants
   *
   * permissive - arbitrary nesting of namespaces is allowed
   */
  namespaceSupport?: 'conservative' | 'permissive';
}

/**
 * Configuration values used for the {@link IExtractorValidationRulesConfig} block.
 * @public
 */
export const enum ExtractorValidationRulePolicy {
  /**
   * Violations of the rule will be reported as build errors.
   */
  error = 'error',
  /**
   * Violations of the rule are silently ignored.
   */
  allow = 'allow'
}

/**
 * Configuration for various validation checks that ensure good API design
 *
 * @public
 */
export interface IExtractorValidationRulesConfig {
  /**
   * This rule checks for top-level API items that are missing a release tag such as \@beta or \@internal.
   * If "allow" is chosen, then missing release tags will be assumed to be \@public.
   * The default policy is "error".
   */
  missingReleaseTags?: ExtractorValidationRulePolicy;
}

/**
 * Configures how the API review files (*.api.ts) will be generated.
 *
 * @public
 */
export interface IExtractorApiReviewFileConfig {
  /**
   * Whether to generate review files at all.  The default is true.
   */
  enabled: boolean;

  /**
   * The file path of the folder containing API review file, relative to
   * the project folder.  This is part of an API review workflow:  During a build,
   * the API Extractor will output an API file, e.g. "my-project/temp/my-project.api.ts".
   * It will then compare this file against the last reviewed file,
   * e.g. "../api-review/my-project.api.ts" (assuming that apiReviewFolder is "../api-review").
   * If the files are different, the build will fail with an error message that instructs
   * the developer to update the approved file, and then commit it to Git.  When they
   * create a Pull Request, a branch policy will look for changes under "api-review/*"
   * and require signoff from the appropriate reviewers.
   *
   * The default value is "./etc".
   *
   * Example: "config" (for a standalone project)
   * Example: "../../common/api-review"  (for a Git repository with Rush)
   */
  apiReviewFolder?: string;

  /**
   * The *.api.ts report is saved into this folder.  During a production build
   * (i.e. when IExtractorRuntimeOptions.productionBuild=true) the temporary file will
   * be compared with the file in apiReviewFolder; if there are differences, and error
   * will be reported.  During a non-production build, the temporary file will be
   * automatically copied to the apiReviewFolder.
   *
   * The default value is "./temp".
   */
  tempFolder?: string;
}

/**
 * Configures how the API JSON files (*.api.json) will be generated.
 *
 * @public
 */
export interface IExtractorApiJsonFileConfig {
  /**
   * Whether to generate API JSON files at all.  The default is true.
   */
  enabled: boolean;

  /**
   * Specifies where the *.api.json file should be written.
   *
   * The default value is "./dist"
   */
  outputFolder?: string;
}

/**
 * Configures how the *.d.ts rollup files will be generated.
 *
 * @remarks
 * API Extractor can generate a consolidated *.d.ts file that contains all
 * the exported typings for the package entry point.  It can also trim
 * \@alpha, \@beta, and \@internal definitions according to the release type.
 *
 * @beta
 */
export interface IExtractorDtsRollupConfig {
  /**
   * Whether to generate rollup *.d.ts files.  The default is false.
   */
  enabled: boolean;

  /**
   * If "trimming" is false (the default), then a single *.d.ts rollup file will be generated in the
   * "publishFolder".  If "trimming" is true, then three separate *.d.ts rollups will be
   * generated in "publishFolderForInternal", "publishFolderForBeta", and "publishFolderForPublic".
   *
   * @remarks
   * In either case, "mainDtsRollupPath" indicates the relative file path.
   */
  trimming?: boolean;

  /**
   * This setting is only used if "trimming" is false.
   * It indicates the folder where "npm publish" will be run.  The default value is "./dist".
   */
  publishFolder?: string;

  /**
   * This setting is only used if "trimming" is true.
   * It indicates the folder where "npm publish" will be run for an internal release.
   * The default value is "./dist/internal".
   *
   * @remarks
   * An internal release will contain all definitions that are reachable from the entry point.
   */
  publishFolderForInternal?: string;

  /**
   * This setting is only used if "trimming" is true.
   * It indicates the folder where "npm publish" will be run for a beta release.
   * The default value is "./dist/beta".
   *
   * @remarks
   * A beta release will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@alpha or \@internal.
   */
  publishFolderForBeta?: string;

  /**
   * This setting is only used if "trimming" is true.
   * It indicates the folder where "npm publish" will be run for a public release.
   * The default value is "./dist/public".
   *
   * @remarks
   * A public release will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@beta, \@alpha, or \@internal.
   */
  publishFolderForPublic?: string;

  /**
   * Specifies the relative path for the *.d.ts rollup file to be generated for the
   * package's main entry point.  The default value is an empty string, which causes
   * the path to be automatically inferred from the "typings" field of the project's
   * package.json file.
   *
   * @remarks
   * If specified, the value must be a relative path that can be combined with one of
   * the publish folder settings.
   */
  mainDtsRollupPath?: string;
}

/**
 * Configures how the tsdoc metadata file will be generated.
 *
 * @beta
 */
export interface IExtractorTsdocMetadataConfig {
  /**
   * Whether to generate the TSDoc metadata file. The default is false.
   */
  enabled: boolean;

  /**
   * Specifies where the TSDoc metadata file should be written. The default value is
   * an empty string, which causes the path to be automatically inferred from the
   * "tsdocMetadata", "typings" or "main" fields of the project's package.json.
   * If none of these fields are set, it defaults to "tsdoc-metadata.json".
   */
  tsdocMetadataPath?: string;
}

/**
 * Used with {@link IExtractorMessageRoutingConfig.logLevel}.
 *
 * @public
 */
export const enum ExtractorMessageLogLevel {
  /**
   * The message will be written to the output log as an error.
   *
   * @remarks
   * Errors cause the build to fail and return a nonzero exit code.
   */
  Error = 'Error',

  /**
   * The message will be written to the build output as an warning.
   * @remarks
   * Warnings cause a production build fail and return a nonzero exit code.  For a non-production build
   * (e.g. using the `--local` option with `api-extractor run`), the warning is displayed but the build will not fail.
   */
  Warning = 'Warning',

  /**
   * The message will not be reported to the output log.
   */
  None = 'None'
}

/**
 * Configures how API Extractor messages are reported.
 *
 * @public
 */
export interface IExtractorMessageReportingRuleConfig {
  /**
   * Specifies whether the message should be written to the the tool's output log.
   *
   * @remarks
   * Note that the `addToApiReviewFile` property may supersede this option.
   */
  logLevel: ExtractorMessageLogLevel;

  /**
   * If API Extractor is configured to write an API review file (.api.ts), then the message will be written
   * inside that file.  If the API review file is NOT being written, then the message is instead logged according
   * to the `logLevel` option.
   */
  addToApiReviewFile: boolean;
}

/**
 * Specifies a table of reporting rules for different message IDs, and also the default rule used for IDs that
 * do not appear in the table.
 *
 * @public
 */
export interface IExtractorMessageReportingTableConfig {
  /**
   * The key is a message ID for the associated type of message, or "default" to specify the default policy.
   * For example, the key might be `TS2551` (a compiler message), `tsdoc-link-tag-unescaped-text` (a TSDOc message),
   * or `ae-extra-release-tag` (a message related to the API Extractor analysis).
   */
  [messageId: string]: IExtractorMessageReportingRuleConfig;
}

/**
 * Configures how API Extractor reports issues that it encounters.
 *
 * @public
 */
export interface IExtractorMessagesConfig {
  /**
   * Configures handling of diagnostic messages generating the TypeScript compiler while analyzing the
   * input .d.ts files.
   */
  compilerMessageReporting: IExtractorMessageReportingTableConfig;

  /**
   * Configures handling of messages reported by the TSDoc parser when analyzing code comments.
   */
  tsdocMessageReporting: IExtractorMessageReportingTableConfig;

  /**
   * Configures handling of messages reported by API Extractor during its analysis.
   */
  extractorMessageReporting: IExtractorMessageReportingTableConfig;
}

/**
 * Configuration options for the API Extractor tool.  These options can be loaded
 * from a JSON config file.
 *
 * @public
 */
export interface IExtractorConfig {
  /**
   * Path to json config file from which config should extend.
   * The path specified in this field is relative to current config file path.
   */
  extends?: string;

  /**
   * Determines how the TypeScript compiler will be invoked.
   * The compiler.configType selects the type of configuration;
   * Different options are available according to the configuration type.
   */
  compiler: IExtractorTsconfigCompilerConfig | IExtractorRuntimeCompilerConfig;

  /**
   * {@inheritdoc IExtractorPoliciesConfig}
   */
  policies?: IExtractorPoliciesConfig;

  /**
   * {@inheritdoc IExtractorValidationRulesConfig}
   */
  validationRules?: IExtractorValidationRulesConfig;

  /**
   * {@inheritdoc IExtractorProjectConfig}
   */
  project: IExtractorProjectConfig;

  /**
   * {@inheritdoc IExtractorApiReviewFileConfig}
   */
  apiReviewFile?: IExtractorApiReviewFileConfig;

  /**
   * {@inheritdoc IExtractorApiJsonFileConfig}
   */
  apiJsonFile?: IExtractorApiJsonFileConfig;

  /**
   * {@inheritdoc IExtractorDtsRollupConfig}
   * @beta
   */
  dtsRollup?: IExtractorDtsRollupConfig;

  /**
   * {@inheritdoc IExtractorTsdocMetadataConfig}
   * @beta
   */
  tsdocMetadata?: IExtractorTsdocMetadataConfig;

  /**
   * {@inheritdoc IExtractorMessagesConfig}
   */
  messages?: IExtractorMessagesConfig;

  /**
   * This option causes the typechecker to be invoked with the --skipLibCheck option. This option is not
   * recommended and may cause API Extractor to produce incomplete or incorrect declarations, but it
   * may be required when dependencies contain declarations that are incompatible with the TypeScript engine
   * that API Extractor uses for its analysis. If this option is used, it is strongly recommended that broken
   * dependencies be fixed or upgraded.
   *
   * @remarks
   * This option only applies when compiler.config.configType is set to "tsconfig"
   */
  skipLibCheck?: boolean;

  /**
   * Set to true when invoking API Extractor's test harness.
   * @remarks
   * When `testMode` is true, the `toolVersion` field in the .api.json file is assigned an empty string
   * to prevent spurious diffs in output files tracked for tests.
   */
  testMode?: boolean;
}
