// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export {
 LocalizationPlugin,
 IStringPlaceholder as _IStringPlaceholder
} from './LocalizationPlugin';

export {
  IDefaultLocaleOptions,
  ILocaleFileData,
  ILocale,
  ILocales,
  ILocalizationPluginOptions,
  ILocalizationStats,
  ILocalizationStatsChunkGroup,
  ILocalizationStatsEntrypoint,
  ITypingsGenerationOptions
} from './interfaces';

export {
  ITypingsGeneratorOptions as ILocFilePreprocessorOptions,
  TypingsGenerator as LocFilePreprocessor
} from './TypingsGenerator';
