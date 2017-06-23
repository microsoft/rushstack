// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps you build better TypeScript library packages.
 * It helps with validation, documentation, and reviewing of the exported API
 * for a TypeScript library.
 */
declare const packageDescription: void;

export { default as Extractor, IExtractorOptions, IExtractorAnalyzeOptions, ApiErrorHandler } from './Extractor';
export { default as ApiFileGenerator  } from './generators/ApiFileGenerator';
export { default as ApiJsonGenerator  } from './generators/ApiJsonGenerator';
export { default as ExternalApiHelper } from './ExternalApiHelper';
