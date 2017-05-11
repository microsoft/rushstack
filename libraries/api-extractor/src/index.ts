
/**
 * A utility that analyzes a project, detects common JSDoc problems , and generates
 * a report of the exported Public API.
 */
declare const packageDescription: void;

export { default as Extractor, IExtractorOptions, IExtractorAnalyzeOptions, ApiErrorHandler } from './Extractor';
export { default as ApiFileGenerator  } from './generators/ApiFileGenerator';
export { default as ApiJsonGenerator  } from './generators/ApiJsonGenerator';
export { default as ExternalApiHelper } from './ExternalApiHelper';
