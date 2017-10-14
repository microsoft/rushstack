// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 */
declare const packageDescription: void; // tslint:disable-line:no-unused-variable

export { default as ExternalApiHelper } from './ExternalApiHelper';

export { ApiExtractor, IAnalyzeProjectOptions } from './extractor/ApiExtractor';
export {
  ExtractorErrorHandler,
  IExtractorTsconfigCompilerConfig,
  IExtractorRuntimeCompilerConfig,
  IExtractorProjectConfig,
  IExtractorApiReviewFileConfig,
  IExtractorApiJsonFileConfig,
  IExtractorConfig
} from './extractor/IExtractorConfig';

export * from './api/ApiItem';
export * from './markup/MarkupElement';
export * from './markup/OldMarkup';
