// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 *
 * @packagedocumentation
 */

export { ExternalApiHelper } from './ExternalApiHelper';

export { Extractor, IAnalyzeProjectOptions, IExtractorOptions } from './extractor/Extractor';
export {
  IExtractorTsconfigCompilerConfig,
  IExtractorRuntimeCompilerConfig,
  IExtractorProjectConfig,
  IExtractorPoliciesConfig,
  ExtractorValidationRulePolicy,
  IExtractorValidationRulesConfig,
  IExtractorApiReviewFileConfig,
  IExtractorApiJsonFileConfig,
  IExtractorPackageTypingsConfig,
  IExtractorConfig
} from './extractor/IExtractorConfig';

export { ILogger } from './extractor/ILogger';

export * from './api/ApiItem';
export { ApiJsonFile } from './api/ApiJsonFile';
export * from './markup/MarkupElement';
export { Markup, IMarkupCreateTextOptions } from './markup/Markup';
