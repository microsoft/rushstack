// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  APIExtractorConfiguration as IConfigFile,
  ApiReportVariant,
  ConfigApiReport as IConfigApiReport,
  ConfigCompiler as IConfigCompiler,
  ConfigDocModel as IConfigDocModel,
  ConfigDtsRollup as IConfigDtsRollup,
  ConfigMessageReportingRule as IConfigMessageReportingRule,
  ConfigTsdocMetadata as IConfigTsdocMetadata,
  ExtractorMessageReportingTable as IConfigMessageReportingTable,
  ExtractorMessagesConfig as IExtractorMessagesConfig,
  ReleaseTagForTrim
} from '../schemas/api-extractor.schema.json.d.ts';

/**
 * Determines how the TypeScript compiler engine will be invoked by API Extractor.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigCompiler };

/**
 * The allowed variations of API reports.
 *
 * @public
 */
export type { ApiReportVariant };

/**
 * Configures how the API report files (*.api.md) will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigApiReport };

/**
 * The allowed release tags that can be used to mark API items.
 * @public
 */
export type { ReleaseTagForTrim };

/**
 * Configures how the doc model file (*.api.json) will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigDocModel };

/**
 * Configures how the .d.ts rollup file will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigDtsRollup };

/**
 * Configures how the tsdoc-metadata.json file will be generated.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigTsdocMetadata };

/**
 * Configures reporting for a given message identifier.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigMessageReportingRule };

/**
 * Specifies a table of reporting rules for different message identifiers, and also the default rule used for
 * identifiers that do not appear in the table.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IConfigMessageReportingTable };

/**
 * Configures how API Extractor reports error and warning messages produced during analysis.
 *
 * @remarks
 * This is part of the {@link IConfigFile} structure.
 *
 * @public
 */
export type { IExtractorMessagesConfig };
/**
 * Configuration options for the API Extractor tool.  These options can be constructed programmatically
 * or loaded from the api-extractor.json config file using the {@link ExtractorConfig} class.
 *
 * @public
 */
export type { IConfigFile };
