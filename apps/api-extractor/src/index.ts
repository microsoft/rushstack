// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 *
 * @packageDocumentation
 */

export { Extractor, IAnalyzeProjectOptions, IExtractorOptions } from './api/Extractor';
export {
  ExtractorMessage,
  IExtractorMessageProperties,
  ExtractorMessageCategory
} from './api/ExtractorMessage';
export { ExtractorMessageId } from './api/ExtractorMessageId';
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
  IExtractorTsdocMetadataConfig,
  ExtractorMessageLogLevel,
  IExtractorMessageReportingRuleConfig,
  IExtractorMessageReportingTableConfig,
  IExtractorMessagesConfig,
  IExtractorConfig
} from './api/IExtractorConfig';

export { ILogger } from './api/ILogger';
