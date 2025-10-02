// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, Compilation } from 'webpack';

import type { IPseudolocaleOptions } from '@rushstack/localization-utilities';

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
 * @public
 */
export interface IDefaultLocaleOptions {
  /**
   * This required property specifies the name of the locale used in the
   * `.resx`, `.loc.json`, and `.resjson` files in the source
   */
  localeName: string;

  /**
   * If this option is set to `true`, strings that are missing from
   * `localizedData.translatedStrings` will be provided by the default locale
   */
  fillMissingTranslationStrings?: boolean;
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
   * Use this parameter to specify a function used to load translations missing from
   * the {@link ILocalizedData.translatedStrings} parameter.
   */
  resolveMissingTranslatedStrings?: (
    locales: string[],
    localizedFileKey: string,
    loaderContext: LoaderContext<{}>
  ) => Promise<IResolvedMissingTranslations> | IResolvedMissingTranslations;

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
   * dropped at `localizationStats.dropPath` after compilation completes, and the compilation instance.
   */
  callback?: (stats: ILocalizationStats, compilation: Compilation) => void;
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
   * This option is used to specify `.resx`, `.resx.json`, and `.loc.json` files that should not be processed by
   * this plugin.
   */
  globsToIgnore?: string[];

  /**
   * The value to replace the [locale] token with for chunks without localized strings. Defaults to "none"
   */
  noStringsLocaleName?: string;

  /**
   * A chunk of javascript to use to get the current locale at runtime. If specified, allows the runtime chunk
   * to be non-localized even if it has async localized chunks, as long as it does not directly contain strings.
   */
  runtimeLocaleExpression?: string;

  /**
   * Options for how localization stats data should be produced.
   */
  localizationStats?: ILocalizationStatsOptions;

  /**
   * Custom function for controlling how locale names are formatted based on the locale specified.
   * This is useful if you want to emit non-localized files to the root output directory instead
   * of a '/none' subdirectory.
   *
   * If combining with runtimeLocaleExpression, ensure that the runtime output of
   * runtimeLocaleExpression produces the same output as formatLocaleForFilename.
   */
  formatLocaleForFilename?: (locale: string) => string;

  /**
   * If set to true, update usages of [contenthash] to use the true hash of the file contents
   */
  realContentHash?: boolean;
}

/**
 * @public
 */
export interface ILocaleFileObject {
  [stringName: string]: string;
}

/**
 * @public
 * Accepted formats:
 *  - A string containing the path to the translations in .resjson format (keys mapped directly to values)
 *  - An object mapping keys directly to values
 *  - A map mapping keys directly to values
 */
export type ILocaleFileData = string | ILocaleFileObject | ReadonlyMap<string, string>;

/**
 * @public
 */
export type IResolvedMissingTranslations = ReadonlyMap<string, ILocaleFileData>;

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
export interface ILocaleElementMap {
  [locale: string]: string;
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
