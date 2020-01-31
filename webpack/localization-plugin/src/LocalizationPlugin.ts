// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@microsoft/node-core-library';
import * as Webpack from 'webpack';
import * as path from 'path';
import * as lodash from 'lodash';
import * as Tapable from 'tapable';

/**
 * @public
 */
export interface ILocFileData {
  [stringName: string]: string;
}

/**
 * @public
 */
export interface ILocale {
  [locFilePath: string]: ILocFileData;
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
export interface IDefaultLocaleOptions {
  locale?: string;
  usePassthroughLocale?: boolean;

  /**
   * If {@link IDefaultLocaleOptions.usePassthroughLocale} is set, use this name for the passthrough locale.
   * Defaults to "passthrough"
   */
  passthroughLocaleName?: string;
}

/**
 * The options for localization.
 *
 * @public
 */
export interface ILocalizationPluginOptions {
  localizedStrings: ILocales;
  defaultLocale: IDefaultLocaleOptions;
  filesToIgnore?: string[];
  localizationStatsDropPath?: string;
  localizationStatsCallback?: (stats: ILocalizationStats) => void;
}

/**
 * @internal
 */
export interface IStringPlaceholder {
  value: string;
  suffix: string;
}

const PLUGIN_NAME: string = 'localization';
const LOCALE_FILENAME_PLACEHOLDER: string = '[locale]';
const LOCALE_FILENAME_PLACEHOLDER_REGEX: RegExp = new RegExp(lodash.escapeRegExp(LOCALE_FILENAME_PLACEHOLDER), 'g');
const STRING_PLACEHOLDER_PREFIX: string = '-LOCALIZED-STRING-f12dy0i7-n4bo-dqwj-39gf-sasqehjmihz9';

interface IProcessAssetResult {
  filename: string;
  asset: IAsset;
}

interface IAsset {
  size(): number;
  source(): string;
}

interface IExtendedMainTemplate {
  hooks: {
    localVars: Tapable.SyncHook<string, Webpack.compilation.Chunk, string>;
  };
}

interface ISingleLocaleConfigOptions {
  localeName: string;
  resolvedStrings: Map<string, Map<string, string>>;
  passthroughLocale: boolean;
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

/**
 * This plugin facilitates localization in webpack.
 *
 * @public
 */
export class LocalizationPlugin implements Webpack.Plugin {
  /**
   * @internal
   */
  public stringKeys: Map<string, IStringPlaceholder>;

  private _options: ILocalizationPluginOptions;
  private _locFiles: Set<string>;
  private _filesToIgnore: Set<string>;
  private _stringPlaceholderCounter: number;
  private _stringPlaceholderMap: Map<string, { [locale: string]: string }>;
  private _passthroughStringsMap: Map<string, string>;
  private _locales: Set<string>;
  private _localeNamePlaceholder: IStringPlaceholder;
  private _defaultLocale: string;

  /**
   * The outermost map's keys are the locale names.
   * The middle map's keys are the resolved, uppercased file names.
   * The innermost map's keys are the string identifiers and its values are the string values.
   */
  private _resolvedLocalizedStrings: Map<string, Map<string, Map<string, string>>>;

  public constructor(options: ILocalizationPluginOptions) {
    this._options = options;
  }

  public apply(compiler: Webpack.Compiler): void {
    const isWebpack4: boolean = !!compiler.hooks;

    if (!isWebpack4) {
      throw new Error('The localization plugin requires webpack 4');
    }

    const errors: Error[] = this._initializeAndValidateOptions(compiler.options);

    if (errors.length > 0) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
        compilation.errors.push(...errors);
      });

      this._amendWebpackConfigurationForInPlaceLocFiles(compiler.options);

      return;
    }

    // https://github.com/webpack/webpack-dev-server/pull/1929/files#diff-15fb51940da53816af13330d8ce69b4eR66
    const isWebpackDevServer: boolean = process.env.WEBPACK_DEV_SERVER === 'true';
    if (isWebpackDevServer) {
        this._amendWebpackConfigurationForInPlaceLocFiles(compiler.options);
    } else if (this._locales.size === 1) {
      const singleLocale: string = Array.from(this._locales.keys())[0];
      const resolvedStrings: Map<string, Map<string, string>> = this._resolvedLocalizedStrings.get(singleLocale)!;
      this._amendWebpackConfigurationForSingleLocale(
        compiler.options,
        {
          localeName: singleLocale,
          passthroughLocale: false,
          resolvedStrings
        }
      );
    } else {
      this._amendWebpackConfigurationForMultiLocale(compiler.options);

      if (errors.length === 0) {
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
          (compilation.mainTemplate as unknown as IExtendedMainTemplate).hooks.localVars.tap(
            PLUGIN_NAME,
            (source: string, chunk: Webpack.compilation.Chunk, hash: string) => {
              return source.replace(LOCALE_FILENAME_PLACEHOLDER_REGEX, this._localeNamePlaceholder.value);
            }
          );
        });

        compiler.hooks.emit.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
          const localizationStats: ILocalizationStats = {
            entrypoints: {},
            namedChunkGroups: {}
          };

          const alreadyProcessedAssets: Set<string> = new Set<string>();

          for (const chunkGroup of compilation.chunkGroups) {
            const children: Webpack.compilation.Chunk[] = chunkGroup.getChildren();
            if (
              (children.length > 0) && // Chunks found
              (
                !compiler.options.output ||
                !compiler.options.output.chunkFilename ||
                compiler.options.output.chunkFilename.indexOf(LOCALE_FILENAME_PLACEHOLDER) === -1
              )
            ) {
              compilation.errors.push(new Error(
                'The configuration.output.chunkFilename property must be provided and must include ' +
                `the ${LOCALE_FILENAME_PLACEHOLDER} placeholder`
              ));

              return;
            }

            const chunkFiles: string[] = chunkGroup.getFiles();
            for (const chunkFileName of chunkFiles) {
              if (
                chunkFileName.match(LOCALE_FILENAME_PLACEHOLDER_REGEX) && // Ensure this is expected to be localized
                chunkFileName.endsWith('.js') && // Ensure this is a JS file
                !alreadyProcessedAssets.has(chunkFileName) // Ensure this isn't a vendor chunk we've already processed
              ) {
                alreadyProcessedAssets.add(chunkFileName);

                const asset: IAsset = compilation.assets[chunkFileName];
                const resultingAssets: Map<string, IProcessAssetResult> = this._processAsset(
                  compilation,
                  chunkFileName,
                  asset
                );

                // Delete the existing asset because it's been renamed
                delete compilation.assets[chunkFileName];

                const localizedChunkAssets: { [locale: string]: string } = {};
                for (const [locale, newAsset] of resultingAssets) {
                  compilation.assets[newAsset.filename] = newAsset.asset;
                  localizedChunkAssets[locale] = newAsset.filename;
                }

                if (chunkGroup.getParents().length > 0) {
                  // This is a secondary chunk
                  localizationStats.namedChunkGroups[chunkGroup.name] = {
                    localizedAssets: localizedChunkAssets
                  };
                } else {
                  // This is an entrypoint
                  localizationStats.entrypoints[chunkGroup.name] = {
                    localizedAssets: localizedChunkAssets
                  };
                }
              }
            }
          }

          if (this._options.localizationStatsDropPath) {
            const resolvedLocalizationStatsDropPath: string = path.resolve(
              compiler.outputPath,
              this._options.localizationStatsDropPath
            );
            JsonFile.save(localizationStats, resolvedLocalizationStatsDropPath);
          }

          if (this._options.localizationStatsCallback) {
            try {
              this._options.localizationStatsCallback(localizationStats);
            } catch (e) {
              /* swallow errors from the callback */
            }
          }
        });
      }
    }
  }

  private _processAsset(
    compilation: Webpack.compilation.Compilation,
    assetName: string,
    asset: IAsset
  ): Map<string, IProcessAssetResult> {
    interface IReconstructionElement {
      kind: 'static' | 'localized';
    }

    interface IStaticReconstructionElement extends IReconstructionElement {
      kind: 'static';
      staticString: string;
    }

    interface ILocalizedReconstructionElement extends IReconstructionElement {
      kind: 'localized';
      values: { [locale: string]: string };
      size: number;
      quotemarkCharacter: string | undefined;
    }

    const placeholderRegex: RegExp = new RegExp(`${lodash.escapeRegExp(STRING_PLACEHOLDER_PREFIX)}_(.+)_(\\d+)`, 'g');
    const result: Map<string, IProcessAssetResult> = new Map<string, IProcessAssetResult>();
    const assetSource: string = asset.source();

    const reconstructionSeries: IReconstructionElement[] = [];

    let lastIndex: number = 0;
    let regexResult: RegExpExecArray | null;
    while (regexResult = placeholderRegex.exec(assetSource)) { // eslint-disable-line no-cond-assign
      const staticElement: IStaticReconstructionElement = {
        kind: 'static',
        staticString: assetSource.substring(lastIndex, regexResult.index)
      };
      reconstructionSeries.push(staticElement);

      const [placeholder, quotemark, placeholderSerialNumber] = regexResult;

      const values: { [locale: string]: string } | undefined = this._stringPlaceholderMap.get(placeholderSerialNumber);
      if (!values) {
        compilation.errors.push(new Error(`Missing placeholder ${placeholder}`));
        const brokenLocalizedElement: IStaticReconstructionElement = {
          kind: 'static',
          staticString: placeholder
        };
        reconstructionSeries.push(brokenLocalizedElement);
      } else {
        const localizedElement: ILocalizedReconstructionElement = {
          kind: 'localized',
          values: values,
          size: placeholder.length,
          quotemarkCharacter: quotemark !== '"' ? quotemark : undefined
        };
        reconstructionSeries.push(localizedElement);
        lastIndex = regexResult.index + placeholder.length;
      }
    }

    const lastElement: IStaticReconstructionElement = {
      kind: 'static',
      staticString: assetSource.substr(lastIndex)
    };
    reconstructionSeries.push(lastElement);

    for (const locale of this._locales) {
      const reconstruction: string[] = [];

      let sizeDiff: number = 0;
      for (const element of reconstructionSeries) {
        if (element.kind === 'static') {
          reconstruction.push((element as IStaticReconstructionElement).staticString);
        } else {
          const localizedElement: ILocalizedReconstructionElement = element as ILocalizedReconstructionElement;
          let newValue: string = localizedElement.values[locale];
          if (localizedElement.quotemarkCharacter) {
            // Replace the quotemark character with the correctly-escaped character
            newValue = newValue.replace(/\"/g, localizedElement.quotemarkCharacter)
          }

          reconstruction.push(newValue);
          sizeDiff += (newValue.length - localizedElement.size);
        }
      }

      let newAsset: IAsset;
      if (locale === this._defaultLocale) {
        newAsset = asset;
      } else {
        newAsset = lodash.clone(asset);
      }

      // TODO:
      //  - Fixup source maps
      const resultFilename: string = assetName.replace(LOCALE_FILENAME_PLACEHOLDER_REGEX, locale);
      const newAssetSource: string = reconstruction.join('');
      const newAssetSize: number = asset.size() + sizeDiff;
      newAsset.source = () => newAssetSource;
      newAsset.size = () => newAssetSize;
      result.set(
        locale,
        {
          filename: resultFilename,
          asset: newAsset
        }
      );
    }

    return result;
  }

  private _amendWebpackConfigurationForMultiLocale(configuration: Webpack.Configuration): void {
    this._addRulesAndWarningLoaderToConfiguration(
      configuration,
      [
        {
          test: (filePath: string) => this._locFiles.has(filePath),
          loader: path.resolve(__dirname, 'loaders', 'LocJsonLoader.js'),
          options: {
            pluginInstance: this
          }
        }
      ]
    );
  }

  private _amendWebpackConfigurationForSingleLocale(
    configuration: Webpack.Configuration,
    options: ISingleLocaleConfigOptions
  ): void {
    // We can cheat on the validation a bit here because _initializeAndValidateOptions already validated this
    configuration.output!.filename = (configuration.output!.filename as string).replace(
      LOCALE_FILENAME_PLACEHOLDER_REGEX,
      options.localeName
    );
    if (configuration.output!.chunkFilename) {
      configuration.output!.chunkFilename = (configuration.output!.chunkFilename as string).replace(
        LOCALE_FILENAME_PLACEHOLDER_REGEX,
        options.localeName
      );
    }

    const loader: string = path.resolve(__dirname, 'loaders', 'SingleLocaleLoader.js');
    const loaderOptions: Webpack.RuleSetQuery = {
      resolvedStrings: options.resolvedStrings,
      passthroughLocale: options.passthroughLocale
    };

    this._addRulesAndWarningLoaderToConfiguration(
      configuration,
      [
        {
          test: {
            and: [
              (filePath: string) => this._locFiles.has(filePath),
              /\.loc\.json$/i
            ]
          },
          loader: loader,
          options: loaderOptions
        },
        {
          test: {
            and: [
              (filePath: string) => this._locFiles.has(filePath),
              /\.resx$/i
            ]
          },
          use: [
            require.resolve('json-loader'),
            {
              loader: loader,
              options: loaderOptions
            }
          ]
        }
      ]
    );
  }

  private _amendWebpackConfigurationForInPlaceLocFiles(configuration: Webpack.Configuration): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'InPlaceLocFileLoader.js');

    this._addRulesToConfiguration(
      configuration,
      [
        {
          test: /\.loc\.json$/i,
          loader: loader
        },
        {
          test: /\.resx$/i,
          use: [
            require.resolve('json-loader'),
            loader
          ]
        }
      ]
    );
  }

  private _addRulesAndWarningLoaderToConfiguration(
    configuration: Webpack.Configuration,
    rules: Webpack.RuleSetRule[]
  ): void {
    this._addRulesToConfiguration(
      configuration,
      [
        ...rules,
        {
          test: {
            and: [
              (filePath: string) => !this._locFiles.has(filePath),
              (filePath: string) => !this._filesToIgnore.has(filePath),
              {
                or: [
                  /\.loc\.json$/i,
                  /\.resx$/i
                ]
              }
            ]
          },
          loader: path.resolve(__dirname, 'loaders', 'MissingLocDataWarningLoader.js')
        }
      ]
    );
  }

  private _addRulesToConfiguration(configuration: Webpack.Configuration, rules: Webpack.RuleSetRule[]): void {
    if (!configuration.module) {
      configuration.module = {
        rules: []
      };
    }

    if (!configuration.module.rules) {
      configuration.module.rules = [];
    }

    configuration.module.rules.push(...rules);
  }

  private _initializeAndValidateOptions(configuration: Webpack.Configuration): Error[] {
    const errors: Error[] = [];

    // START configuration
    { // eslint-disable-line no-lone-blocks
      if (
        !configuration.output ||
        !configuration.output.filename ||
        (typeof configuration.output.filename !== 'string') ||
        configuration.output.filename.indexOf(LOCALE_FILENAME_PLACEHOLDER) === -1
      ) {
        errors.push(new Error(
          'The configuration.output.filename property must be provided, must be a string, and must include ' +
          `the ${LOCALE_FILENAME_PLACEHOLDER} placeholder`
        ));
      }
    }
    // END configuration

    // START options.filesToIgnore
    { // eslint-disable-line no-lone-blocks
      this._filesToIgnore = new Set<string>();
      for (const filePath of this._options.filesToIgnore || []) {
        const normalizedFilePath: string = path.resolve(configuration.context!, filePath);
        this._filesToIgnore.add(normalizedFilePath);
      }
    }
    // END options.filesToIgnore

    // START options.localizedStrings
    { // eslint-disable-line no-lone-blocks
      const { localizedStrings } = this._options;

      const localeNameRegex: RegExp = /[a-z-]/i;
      const definedStringsInLocFiles: Map<string, Set<string>> = new Map<string, Set<string>>();
      this._locFiles = new Set<string>();
      this.stringKeys = new Map<string, IStringPlaceholder>();
      this._stringPlaceholderMap = new Map<string, { [locale: string]: string }>();
      const normalizedLocales: Set<string> = new Set<string>();
      this._locales = new Set<string>();
      this._passthroughStringsMap = new Map<string, string>();
      this._resolvedLocalizedStrings = new Map<string, Map<string, Map<string, string>>>();

      // Create a special placeholder for the locale's name
      this._localeNamePlaceholder = this._getPlaceholderString();
      const localeNameMap: { [localeName: string]: string } = {};
      this._stringPlaceholderMap.set(this._localeNamePlaceholder.suffix, localeNameMap);

      for (const localeName in localizedStrings) {
        if (localizedStrings.hasOwnProperty(localeName)) {
          const normalizedLocaleName: string = localeName;
          if (normalizedLocales.has(normalizedLocaleName)) {
            errors.push(Error(
              `The locale "${localeName}" appears multiple times. ` +
              'There may be multiple instances with different casing.'
            ));
            return errors;
          }

          this._locales.add(localeName);
          normalizedLocales.add(normalizedLocaleName);
          localeNameMap[localeName] = localeName;

          const filesMap: Map<string, Map<string, string>> = new Map<string, Map<string, string>>();
          this._resolvedLocalizedStrings.set(localeName, filesMap);

          if (!localeName.match(localeNameRegex)) {
            errors.push(new Error(
               `Invalid locale name: ${localeName}. Locale names may only contain letters and hyphens.`
            ));
            return errors;
          }

          const locFilePathsInLocale: Set<string> = new Set<string>();

          const locale: ILocale = localizedStrings[localeName];
          for (const locFilePath in locale) {
            if (locale.hasOwnProperty(locFilePath)) {
              const normalizedLocFilePath: string = path.resolve(configuration.context!, locFilePath);

              if (this._filesToIgnore.has(normalizedLocFilePath)) {
                errors.push(new Error(
                  `The localization file path "${locFilePath}" is listed both in the filesToIgnore object and in ` +
                  'strings data.'
                ));
                return errors;
              }

              if (locFilePathsInLocale.has(normalizedLocFilePath)) {
                errors.push(new Error(
                  `The localization file path "${locFilePath}" appears multiple times in locale ${localeName}. ` +
                  'There may be multiple instances with different casing.'
                ));
                return errors;
              }

              locFilePathsInLocale.add(normalizedLocFilePath);
              this._locFiles.add(normalizedLocFilePath);

              const stringsMap: Map<string, string> = new Map<string, string>();
              filesMap.set(normalizedLocFilePath, stringsMap);

              const locFileData: ILocFileData = locale[locFilePath];

              for (const stringName in locFileData) {
                if (locFileData.hasOwnProperty(stringName)) {
                  const stringKey: string = `${normalizedLocFilePath}?${stringName}`;
                  if (!this.stringKeys.has(stringKey)) {
                    this.stringKeys.set(stringKey, this._getPlaceholderString());
                  }

                  const placeholder: IStringPlaceholder = this.stringKeys.get(stringKey)!;
                  if (!this._stringPlaceholderMap.has(placeholder.suffix)) {
                    this._stringPlaceholderMap.set(placeholder.suffix, {});
                    this._passthroughStringsMap.set(placeholder.suffix, stringName);
                  }

                  const stringValue: string = locFileData[stringName];

                  this._stringPlaceholderMap.get(placeholder.suffix)![localeName] = stringValue;

                  if (!definedStringsInLocFiles.has(stringKey)) {
                    definedStringsInLocFiles.set(stringKey, new Set<string>());
                  }

                  definedStringsInLocFiles.get(stringKey)!.add(normalizedLocaleName);

                  stringsMap.set(stringName, stringValue);
                }
              }
            }
          }
        }
      }

      const issues: string[] = [];
      definedStringsInLocFiles.forEach((localesForString: Set<string>, stringKey: string) => {
        if (localesForString.size !== this._locales.size) {
          const missingLocales: string[] = [];
          this._locales.forEach((locale) => {
            if (!localesForString.has(locale)) {
              missingLocales.push(locale);
            }
          });

          const [locFilePath, stringName] = stringKey.split('?');
          issues.push(
            `The string "${stringName}" in "${locFilePath}" is missing in the ` +
            `following locales: ${missingLocales.join(', ')}`
          );
        }
      });

      if (issues.length > 0) {
        errors.push(Error(
          `Issues during localized string validation:\n${issues.map((issue) => `  ${issue}`).join('\n')}`
        ));
      }
    }
    // END options.localizedStrings

    // START options.defaultLocale
    { // eslint-disable-line no-lone-blocks
      if (
        !this._options.defaultLocale ||
        (!this._options.defaultLocale.locale && !this._options.defaultLocale.usePassthroughLocale)
      ) {
        if (this._locales.size === 1) {
          this._defaultLocale = this._locales.entries[0];
        } else {
          errors.push(new Error(
            'Either options.defaultLocale.locale must be provided or options.defaultLocale.usePassthroughLocale ' +
            'must be set to true if more than one locale\'s data is provided'
          ));
        }
      } else {
        const { locale, usePassthroughLocale, passthroughLocaleName } = this._options.defaultLocale;
        if (locale && usePassthroughLocale) {
          errors.push(new Error(
            'Either options.defaultLocale.locale must be provided or options.defaultLocale.usePassthroughLocale ' +
            'must be set to true, but not both'
          ));
        } else if (usePassthroughLocale) {
          this._defaultLocale = passthroughLocaleName || 'passthrough';
          this._locales.add(this._defaultLocale);
          this._stringPlaceholderMap.get(this._localeNamePlaceholder.suffix)![this._defaultLocale] =
            this._defaultLocale;
          this._passthroughStringsMap.forEach((stringName: string, stringKey: string) => {
            this._stringPlaceholderMap.get(stringKey)![this._defaultLocale] = stringName;
          });
        } else if (locale) {
          this._defaultLocale = locale;
          if (!this._locales.has(locale)) {
            errors.push(new Error(`The specified default locale "${locale}" was not provided in the localized data`));
          }
        } else {
          errors.push(new Error('Unknown error occurred processing default locale.'));
        }
      }
    }
    // END options.defaultLocale

    return errors;
  }

  private _getPlaceholderString(): IStringPlaceholder {
    if (this._stringPlaceholderCounter === undefined) {
      this._stringPlaceholderCounter = 0;
    }

    const suffix: string = (this._stringPlaceholderCounter++).toString();
    return {
      value: `${STRING_PLACEHOLDER_PREFIX}_"_${suffix}`,
      suffix: suffix
    };
  }
}
