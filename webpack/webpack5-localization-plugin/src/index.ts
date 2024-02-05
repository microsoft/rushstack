// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { LocalizationPlugin, type IStringPlaceholder as _IStringPlaceholder } from './LocalizationPlugin';
export { TrueHashPlugin } from './TrueHashPlugin';

export {
  ICustomHashFunctionOptions,
  IDefaultLocaleOptions,
  IHashAlgorithmOptions,
  ILocaleData,
  ILocaleElementMap,
  ILocaleFileData,
  ILocaleFileObject,
  ILocalizationPluginOptions,
  ILocalizationStats,
  ILocalizationStatsChunkGroup,
  ILocalizationStatsEntrypoint,
  ILocalizationStatsOptions,
  ILocalizedData,
  ILocalizedStrings,
  IPassthroughLocaleOptions,
  IPseudolocalesOptions,
  IResolvedMissingTranslations,
  ITrueHashPluginOptions,
  ITrueHashPluginOptionsBase,
  WebpackHash
} from './interfaces';

export { ILocalizedWebpackChunk } from './webpackInterfaces';
