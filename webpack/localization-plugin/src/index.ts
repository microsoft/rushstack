// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export {
 LocalizationPlugin,
 IStringPlaceholder as _IStringPlaceholder
} from './LocalizationPlugin';

export {
  IDefaultLocaleOptions,
  ILocaleData,
  ILocaleElementMap,
  ILocaleFileData,
  ILocalizationFile as _ILocFile,
  ILocalizationPluginOptions,
  ILocalizationStats,
  ILocalizationStatsChunkGroup,
  ILocalizationStatsEntrypoint,
  ILocalizationStatsOptions,
  ILocalizedData,
  ILocalizedString as _ILocalizedString,
  ILocalizedStrings,
  IPassthroughLocaleOptions,
  IPseudolocaleOptions,
  IPseudolocalesOptions,
  ITypingsGenerationOptions
} from './interfaces';

export {
  LocFileParser as _LocFileParser,
  IParseLocFileOptions as _IParseLocFileOptions
} from './utilities/LocFileParser';

export {
  ILoggerOptions as _ILoggerOptions
} from './utilities/Logging';

export {
  ILocalizedWebpackChunk
} from './webpackInterfaces';

export {
  ITypingsGeneratorOptions,
  TypingsGenerator
} from './TypingsGenerator';
