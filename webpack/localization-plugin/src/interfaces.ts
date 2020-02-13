// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export interface IPassthroughLocaleOptions {
  usePassthroughLocale?: boolean;

  /**
   * If {@link IPassthroughLocaleOptions.usePassthroughLocale} is set, use this name for the passthrough locale.
   * Defaults to "passthrough"
   */
  passthroughLocaleName?: string;
}

/**
 * @public
 */
export interface ITypingsGenerationOptions {
  generatedTsFolder: string;
  sourceRoot?: string;
  exportAsDefault?: boolean;
}

/**
 * @public
 */
export interface IDefaultLocaleOptions {
  localeName: string;

  fillMissingTranslationStrings?: boolean;
}

/**
 * Options for the pseudolocale library.
 *
 * @internalRemarks
 * Eventually this should be replaced with DefinitelyTyped types.
 *
 * @public
 */
export interface IPseudolocaleOptions {
  prepend?: string;
  append?: string;
  delimiter?: string;
  startDelimiter?: string;
  endDelimiter?: string;
  extend?: number;
  override?: string;
}

/**
 * @public
 */
export interface IPseudolocalesOptions {
  [pseudoLocaleName: string]: IPseudolocaleOptions;
}

/**
 * @public
 */
export interface ILocalizedData {
  /**
   * Use this parameter to specify the translated data.
   */
  translatedStrings: ILocalizedStrings;

  /**
   * Options around including a passthrough locale.
   */
  passthroughLocale?: IPassthroughLocaleOptions;

  /**
   * Options for the locale used in the source localized data files.
   */
  defaultLocale: IDefaultLocaleOptions;

  /**
   * Options for pseudo-localization.
   */
  pseudolocales?: IPseudolocalesOptions;
}

/**
 * @public
 */
export interface ILocalizationStatsOptions {
  dropPath?: string;

  callback?: (stats: ILocalizationStats) => void;
}

/**
 * The options for localization.
 *
 * @public
 */
export interface ILocalizationPluginOptions {
  localizedData: ILocalizedData;

  filesToIgnore?: string[];

  localizationStats?: ILocalizationStatsOptions;

  typingsOptions?: ITypingsGenerationOptions;
}

/**
 * @internal
 */
export interface ILocalizationFile {
  [stringName: string]: ILocalizedString;
}

/**
 * @internal
 */
export interface ILocalizedString {
  value: string;
  comment?: string;
}

/**
 * @public
 */
export interface ILocaleFileData {
  [stringName: string]: string;
}

/**
 * @public
 */
export interface ILocaleData {
  [locFilePath: string]: ILocaleFileData;
}

/**
 * @public
 */
export interface ILocalizedStrings {
  [locale: string]: ILocaleData;
}


/**
 * @public
 */
export interface ILocalizationStatsEntrypoint {
  localizedAssets: { [locale: string]: string };
}

/**
 * @public
 */
export interface ILocalizationStatsChunkGroup {
  localizedAssets: { [locale: string]: string };
}

/**
 * @public
 */
export interface ILocalizationStats {
  entrypoints: { [name: string]: ILocalizationStatsEntrypoint };
  namedChunkGroups: { [name: string]: ILocalizationStatsChunkGroup };
}
