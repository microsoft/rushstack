// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Extractor helps with validation, documentation, and reviewing of the exported API for a TypeScript library.
 * The `@microsoft/api-extractor` package provides the command-line tool.  It also exposes a developer API that you
 * can use to invoke API Extractor programmatically.
 *
 * @packageDocumentation
 */

export { ConsoleMessageId } from './api/ConsoleMessageId.ts';

export { CompilerState, type ICompilerStateCreateOptions } from './api/CompilerState.ts';

export { Extractor, type IExtractorInvokeOptions, ExtractorResult } from './api/Extractor.ts';

export {
  type IExtractorConfigApiReport,
  type IExtractorConfigPrepareOptions,
  type IExtractorConfigLoadForFolderOptions,
  ExtractorConfig
} from './api/ExtractorConfig.ts';

export type { IApiModelGenerationOptions } from './generators/ApiModelGenerator.ts';

export { ExtractorLogLevel } from './api/ExtractorLogLevel.ts';

export {
  ExtractorMessage,
  type IExtractorMessageProperties,
  ExtractorMessageCategory
} from './api/ExtractorMessage.ts';

export { ExtractorMessageId } from './api/ExtractorMessageId.ts';

export type {
  ApiReportVariant,
  IConfigCompiler,
  IConfigApiReport,
  IConfigDocModel,
  IConfigDtsRollup,
  IConfigTsdocMetadata,
  IConfigMessageReportingRule,
  IConfigMessageReportingTable,
  IExtractorMessagesConfig,
  IConfigFile,
  ReleaseTagForTrim
} from './api/IConfigFile.ts';
