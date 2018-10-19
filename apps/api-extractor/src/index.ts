// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 *
 * @packagedocumentation
 */

export { Extractor, IAnalyzeProjectOptions, IExtractorOptions } from './api/Extractor';
export {
  IExtractorTsconfigCompilerConfig,
  IExtractorRuntimeCompilerConfig,
  IExtractorProjectConfig,
  IExtractorPoliciesConfig,
  ExtractorValidationRulePolicy,
  IExtractorValidationRulesConfig,
  IExtractorApiReviewFileConfig,
  IExtractorApiJsonFileConfig,
  IExtractorDtsRollupConfig,
  IExtractorConfig
} from './api/IExtractorConfig';

export { ILogger } from './api/ILogger';
