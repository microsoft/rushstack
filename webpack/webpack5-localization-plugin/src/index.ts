// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

export {
  LocalizationPlugin,
  // TODO: Remove this export in the next major version
  type IStringPlaceholder as _IStringPlaceholder,
  type IStringPlaceholder,
  type ICustomDataPlaceholder as _ICustomDataPlaceholder,
  type IValuePlaceholderBase,
  type ValueForLocaleFn
} from './LocalizationPlugin.ts';
export { TrueHashPlugin, type ITrueHashPluginOptions } from './TrueHashPlugin.ts';

export type {
  IDefaultLocaleOptions,
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
  IResolvedMissingTranslations
} from './interfaces.ts';
export type { ILocalizedWebpackChunk } from './webpackInterfaces.ts';
