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
}

/**
 * The options for localization.
 *
 * @public
 */
export interface ILocalizationPluginOptions {
  /**
   * Use this parameter to specify the translated data.
   */
  localizedStrings: ILocales;

  /**
   * Options around including a passthrough locale.
   */
  passthroughLocale?: IPassthroughLocaleOptions;
  exportAsDefault?: boolean;
  filesToIgnore?: string[];
  localizationStatsDropPath?: string;
  localizationStatsCallback?: (stats: ILocalizationStats) => void;
  typingsOptions?: ITypingsGenerationOptions;
}

export interface ILocFile {
  [stringName: string]: ILocalizedString;
}

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
export interface ILocale {
  [locFilePath: string]: ILocaleFileData;
}

/**
 * @public
 */
export interface ILocales {
  [locale: string]: ILocale;
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
