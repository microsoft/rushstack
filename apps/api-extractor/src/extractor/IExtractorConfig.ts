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

  /**
   * Indicates folders containing additional APJ JSON files (*.api.json) that will be
   * consulted during the analysis.  This is useful for providing annotations for
   * external packages that were not built using API Extractor.
   */
  externalJsonFileFolders?: string[];
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
 * Configures how the package typings (*.d.ts) will be generated.
 * @remarks
 * API Extractor can generate a single unified *.d.ts file that contains all
 * the exported typings for the package entry point.  It can also remove
 * \@alpha \@beta \@internal definitions depending on the release type.
 *
 * @beta
 */
export interface IExtractorPackageTypingsConfig {
  /**
   * Whether to generate package typings.  The default is false.
   */
  enabled: boolean;

  /**
   * Specifies where the *.d.ts files should be written.
   *
   * The default value is "./dist"
   */
  outputFolder?: string;

  /**
   * Specifies the *.d.ts file path used for an internal release.
   * The default value is "index-internal.d.ts".
   *
   * @remarks
   * If the path is not an absolute path, it will be resolved relative to the outputFolder.
   * This output file will contain all definitions that are reachable from the entry point.
   */
  dtsFilePathForInternal?: string;

  /**
   * Specifies the output filename for a preview release.
   * The default value is "index-preview.d.ts".
   *
   * @remarks
   * If the path is not an absolute path, it will be resolved relative to the outputFolder.
   * This output file will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@alpha or \@internal.
   */
  dtsFilePathForPreview?: string;

  /**
   * Specifies the output filename for a public release.
   * The default value is "index-public.d.ts".
   *
   * @remarks
   * If the path is not an absolute path, it will be resolved relative to the outputFolder.
   * This output file will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@beta, \@alpha, or \@internal.
   */
  dtsFilePathForPublic?: string;
}

/**
 * Configuration options for the API Extractor tool.  These options can be loaded
 * from a JSON config file.
 *
 * @public
 */
export interface IExtractorConfig {
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
   * {@inheritdoc IExtractorPackageTypingsConfig}
   * @beta
   */
  packageTypings?: IExtractorPackageTypingsConfig;
}
