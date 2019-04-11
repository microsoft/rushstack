// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ExtractorLogLevel } from './ExtractorLogLevel';

/**
 * Determines how the TypeScript compiler engine will be invoked by API Extractor.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigCompiler {
  /**
   * Specifies the path to the tsconfig.json file to be used by API Extractor when analyzing the project.
   *
   * @remarks
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   *
   * Note: This setting will be ignored if `overrideTsconfig` is used.
   */
  tsconfigFilePath?: string;

  /**
   * Provides already parsed tsconfig.json contents.
   *
   * @remarks
   * The value must conform to the TypeScript tsconfig schema:
   *
   * http://json.schemastore.org/tsconfig
   *
   * If omitted, then the tsconfig.json file will instead be read from the projectFolder.
   */
  overrideTsconfig?: { };

  /**
   * This option causes the compiler to be invoked with the `--skipLibCheck` option.
   *
   * @remarks
   * This option is not recommended and may cause API Extractor to produce incomplete or incorrect declarations,
   * but it may be required when dependencies contain declarations that are incompatible with the TypeScript engine
   * that API Extractor uses for its analysis.  Where possible, the underlying issue should be fixed rather than
   * relying on skipLibCheck.
   */
  skipLibCheck?: boolean;
}

/**
 * Configures how the API report files (*.api.md) will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigApiReport {
  /**
   * Whether to generate an API report.
   */
  enabled: boolean;

  /**
   * The filename for the API report files.  It will be combined with `reportFolder` or `reportTempFolder` to produce
   * a full output filename.
   *
   * @remarks
   * The file extension should be ".api.md", and the string should not contain a path separator such as `\` or `/`.
   */
  reportFileName?: string;

  /**
   * Specifies the folder where the API report file is written.  The file name portion is determined by
   * the `reportFileName` setting.
   *
   * @remarks
   * The API report file is normally tracked by Git.  Changes to it can be used to trigger a branch policy,
   * e.g. for an API review.
   *
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   */
  reportFolder?: string;

  /**
   * Specifies the folder where the temporary report file is written.  The file name portion is determined by
   * the `reportFileName` setting.
   *
   * @remarks
   * After the temporary file is written to disk, it is compared with the file in the `reportFolder`.
   * If they are different, a production build will fail.
   *
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   */
  reportTempFolder?: string;
}

/**
 * Configures how the doc model file (*.api.json) will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigDocModel {
  /**
   * Whether to generate doc model file.
   */
  enabled: boolean;

  /**
   * The output path for the doc model file.  The file extension should be ".api.json".
   *
   * @remarks
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   */
  apiJsonFilePath?: string;
}

/**
 * Configures how the .d.ts rollup file will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigDtsRollup {
  /**
   * Whether to generate the .d.ts rollup file.
   */
  enabled: boolean;

  /**
   * Specifies the output path for a .d.ts rollup file to be generated without any trimming.
   *
   * @remarks
   * This file will include all declarations that are exported by the main entry point.
   *
   * If the path is an empty string, then this file will not be written.
   *
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   */
  untrimmedFilePath?: string;

  /**
   * Specifies the output path for a .d.ts rollup file to be generated with trimming for a "beta" release.
   *
   * @remarks
   * This file will include only declarations that are marked as `@public` or `@beta`.
   *
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   */
  betaTrimmedFilePath?: string;

  /**
   * Specifies the output path for a .d.ts rollup file to be generated with trimming for a "public" release.
   *
   * @remarks
   * This file will include only declarations that are marked as `@public`.
   *
   * If the path is an empty string, then this file will not be written.
   *
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   */
  publicTrimmedFilePath?: string;
}

/**
 * Configures how the tsdoc-metadata.json file will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigTsdocMetadata {
  /**
   * Whether to generate the tsdoc-metadata.json file.
   */
  enabled: boolean;

  /**
   * Specifies where the TSDoc metadata file should be written.
   *
   * @remarks
   * The path is resolved relative to the folder of the config file that contains the setting; to change this,
   * prepend a folder token such as `<projectFolder>`.
   *
   * The default value is `<lookup>`, which causes the path to be automatically inferred from the `tsdocMetadata`,
   * `typings` or `main` fields of the project's package.json.  If none of these fields are set, the lookup
   * falls back to `tsdoc-metadata.json` in the package folder.
   */
  tsdocMetadataFilePath?: string;
}

/**
 * Configures reporting for a given message identifier.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigMessageReportingRule {
  /**
   * Specifies whether the message should be written to the the tool's output log.
   *
   * @remarks
   * Note that the `addToApiReportFile` property may supersede this option.
   */
  logLevel: ExtractorLogLevel;

  /**
   * When `addToApiReportFile` is true:  If API Extractor is configured to write an API report file (.api.md),
   * then the message will be written inside that file; otherwise, the message is instead logged according to
   * the `logLevel` option.
   */
  addToApiReportFile?: boolean;
}

/**
 * Specifies a table of reporting rules for different message identifiers, and also the default rule used for
 * identifiers that do not appear in the table.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IConfigMessageReportingTable {
  /**
   * The key is a message identifier for the associated type of message, or "default" to specify the default policy.
   * For example, the key might be `TS2551` (a compiler message), `tsdoc-link-tag-unescaped-text` (a TSDOc message),
   * or `ae-extra-release-tag` (a message related to the API Extractor analysis).
   */
  [messageId: string]: IConfigMessageReportingRule;
}

/**
 * Configures how API Extractor reports error and warning messages produced during analysis.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export interface IExtractorMessagesConfig {
  /**
   * Configures handling of diagnostic messages generating the TypeScript compiler while analyzing the
   * input .d.ts files.
   */
  compilerMessageReporting?: IConfigMessageReportingTable;

  /**
   * Configures handling of messages reported by API Extractor during its analysis.
   */
  extractorMessageReporting?: IConfigMessageReportingTable;

  /**
   * Configures handling of messages reported by the TSDoc parser when analyzing code comments.
   */
  tsdocMessageReporting?: IConfigMessageReportingTable;
}

/**
 * Configuration options for the API Extractor tool.  These options can be constructed programmatically
 * or loaded from the api-extractor.json config file using the {@link ExtractorConfig} class.
 *
 * @public
 */
export interface IConfigFile {
  /**
   * Optionally specifies another JSON config file that this file extends from.  This provides a way for
   * standard settings to be shared across multiple projects.
   *
   * @remarks
   * If the path starts with `./` or `../`, the path is resolved relative to the folder of the file that contains
   * the `extends` field.  Otherwise, the first path segment is interpreted as an NPM package name, and will be
   * resolved using NodeJS `require()`.
   */
  extends?: string;

  /**
   * Determines the `<projectFolder>` token that can be used with other config file settings.  The project folder
   * typically contains the tsconfig.json and package.json config files, but the path is user-defined.
   *
   * @remarks
   *
   * The path is resolved relative to the folder of the config file that contains the setting.
   *
   * The default value for `projectFolder` is the token `<lookup>`, which means the folder is determined by traversing
   * parent folders, starting from the folder containing api-extractor.json, and stopping at the first folder
   * that contains a tsconfig.json file.  If a tsconfig.json file cannot be found in this way, then an error
   * will be reported.
   */
  projectFolder?: string;

  /**
   * Specifies the .d.ts file to be used as the starting point for analysis.  API Extractor
   * analyzes the symbols exported by this module.
   *
   * @remarks
   *
   * The file extension must be ".d.ts" and not ".ts".
   * The path is resolved relative to the "projectFolder" location.
   */
  mainEntryPointFilePath: string;

  /**
   * {@inheritDoc IConfigCompiler}
   */
  compiler?: IConfigCompiler;

  /**
   * {@inheritDoc IConfigApiReport}
   */
  apiReport?: IConfigApiReport;

  /**
   * {@inheritDoc IConfigDocModel}
   */
  docModel?: IConfigDocModel;

  /**
   * {@inheritDoc IConfigDtsRollup}
   * @beta
   */
  dtsRollup?: IConfigDtsRollup;

  /**
   * {@inheritDoc IConfigTsdocMetadata}
   * @beta
   */
  tsdocMetadata?: IConfigTsdocMetadata;

  /**
   * {@inheritDoc IExtractorMessagesConfig}
   */
  messages?: IExtractorMessagesConfig;

  /**
   * Set to true when invoking API Extractor's test harness.
   * @remarks
   * When `testMode` is true, the `toolVersion` field in the .api.json file is assigned an empty string
   * to prevent spurious diffs in output files tracked for tests.
   */
  testMode?: boolean;
}
