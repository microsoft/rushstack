// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Options for the passthrough locale.
 *
 * @public
 */
export interface IPassthroughLocaleOptions {
  /**
   * If this is set to `true`, a passthrough locale will be included in the output
   */
  usePassthroughLocale?: boolean;

  /**
   * If {@link IPassthroughLocaleOptions.usePassthroughLocale} is set, use this name for the passthrough locale.
   * Defaults to "passthrough"
   */
  passthroughLocaleName?: string;
}

/**
 * Options for typing generation.
 *
 * @public
 */
export interface ITypingsGenerationOptions {
  /**
   * This property specifies the folder in which `.d.ts` files for loc files should be dropped.
   */
  generatedTsFolder: string;

  /**
   * This optional property overrides the compiler context for discovery of localization files
   * for which typings should be generated.
   */
  sourceRoot?: string;

  /**
   * If this option is set to `true`, loc modules typings will be exported wrapped in a `default` property.
   */
  exportAsDefault?: boolean;
}

/**
 * @public
 */
export interface IDefaultLocaleOptions {
  /**
   * This required property specifies the name of the locale used in the
   * `.resx` and `.loc.json` files in the source
   */
  localeName: string;

  /**
   * If this option is set to `true`, strings that are missing from
   * `localizedData.translatedStrings` will be provided by the default locale
   */
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
 * Options for generated pseudolocales.
 *
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
   * Options for the locale used in the source localized data files.
   */
  defaultLocale: IDefaultLocaleOptions;

  /**
   * Use this parameter to specify the translated data.
   */
  translatedStrings: ILocalizedStrings;

  /**
   * Use this paramter to specify a function used to load translations missing from
   * the {@link ILocalizedData.translatedStrings} parameter.
   */
  resolveMissingTranslatedStrings?: (locales: string[], filePath: string) => IResolvedMissingTranslations;

  /**
   * Options around including a passthrough locale.
   */
  passthroughLocale?: IPassthroughLocaleOptions;

  /**
   * Options for pseudo-localization.
   */
  pseudolocales?: IPseudolocalesOptions;
}

/**
 * Options for how localization stats data should be produced.
 *
 * @public
 */
export interface ILocalizationStatsOptions {
  /**
   * This option is used to designate a path at which a JSON file describing the localized
   * assets produced should be written.
   */
  dropPath?: string;

  /**
   * This option is used to specify a callback to be called with the stats data that would be
   * dropped at `localizationStats.dropPath` after compilation completes.
   */
  callback?: (stats: ILocalizationStats) => void;
}

/**
 * The options for localization.
 *
 * @public
 */
export interface ILocalizationPluginOptions {
  /**
   * Localization data.
   */
  localizedData: ILocalizedData;

  /**
   * This option is used to specify `.resx` and `.loc.json` files that should not be processed by this plugin.
   */
  filesToIgnore?: string[];

  /**
   * The value to replace the [locale] token with for chunks without localized strings. Defaults to "none"
   */
  noStringsLocaleName?: string;

  /**
   * Options for how localization stats data should be produced.
   */
  localizationStats?: ILocalizationStatsOptions;

  /**
   * This option is used to specify how and if TypeScript typings should be generated for loc files.
   */
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
export interface IResolvedMissingTranslations {
  [localeName: string]: string | ILocaleFileData;
}

/**
 * @public
 */
export interface ILocaleData {
  [locFilePath: string]: string | ILocaleFileData;
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
export interface ILocaleElementMap {
  [locale: string]: string
}

/**
 * @public
 */
export interface ILocalizationStatsEntrypoint {
  localizedAssets: ILocaleElementMap;
}

/**
 * @public
 */
export interface ILocalizationStatsChunkGroup {
  localizedAssets: ILocaleElementMap;
}

/**
 * @public
 */
export interface ILocalizationStats {
  entrypoints: { [name: string]: ILocalizationStatsEntrypoint };
  namedChunkGroups: { [name: string]: ILocalizationStatsChunkGroup };
}
