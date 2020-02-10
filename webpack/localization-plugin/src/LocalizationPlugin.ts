// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@microsoft/node-core-library';
import * as Webpack from 'webpack';
import * as path from 'path';
import * as lodash from 'lodash';
import * as Tapable from 'tapable';

import { Constants } from './utilities/Constants';
import {
  IWebpackConfigurationUpdaterOptions,
  WebpackConfigurationUpdater
} from './WebpackConfigurationUpdater';
import {
  ILocalizationPluginOptions,
  ILocalizationStats,
  ILocaleFileData,
  ILocaleData,
  ILocFile,
  IPseudolocaleOptions
} from './interfaces';
import { TypingsGenerator } from './TypingsGenerator';
import { Pseudolocalization } from './Pseudolocalization';

/**
 * @internal
 */
export interface IStringPlaceholder {
  value: string;
  suffix: string;
}

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

const PLUGIN_NAME: string = 'localization';

/**
 * This plugin facilitates localization in webpack.
 *
 * @public
 */
export class LocalizationPlugin implements Webpack.Plugin {
  /**
   * @internal
   */
  public stringKeys: Map<string, IStringPlaceholder> = new Map<string, IStringPlaceholder>();

  private _options: ILocalizationPluginOptions;
  private _filesToIgnore: Set<string> = new Set<string>();
  private _stringPlaceholderCounter: number = 0;
  private _stringPlaceholderMap: Map<string, { [locale: string]: string }> = new Map<string, { [locale: string]: string }>();
  private _locales: Set<string> = new Set<string>();
  private _passthroughLocaleName: string;
  private _defaultLocale: string;
  private _fillMissingTranslationStrings: boolean;
  private _localeNamePlaceholder: IStringPlaceholder;
  private _placeholderToLocFilePathMap: Map<string, string> = new Map<string, string>();
  private _placeholderToStringNameMap: Map<string, string> = new Map<string, string>();
  private _pseudolocalizers: Map<string, (str: string) => string> = new Map<string, (str: string) => string>()

  /**
   * The outermost map's keys are the locale names.
   * The middle map's keys are the resolved, file names.
   * The innermost map's keys are the string identifiers and its values are the string values.
   */
  private _resolvedLocalizedStrings: Map<string, Map<string, Map<string, string>>> = new Map<string, Map<string, Map<string, string>>>();

  public constructor(options: ILocalizationPluginOptions) {
    this._options = options;
  }

  public apply(compiler: Webpack.Compiler): void {
    const isWebpack4: boolean = !!compiler.hooks;

    if (!isWebpack4) {
      throw new Error('The localization plugin requires webpack 4');
    }

    if (this._options.typingsOptions && compiler.context) {
      if (
        this._options.typingsOptions.generatedTsFolder &&
        !path.isAbsolute(this._options.typingsOptions.generatedTsFolder)
      ) {
        this._options.typingsOptions.generatedTsFolder = path.resolve(
          compiler.context,
          this._options.typingsOptions.generatedTsFolder
        );
      }

      if (
        this._options.typingsOptions.sourceRoot &&
        !path.isAbsolute(this._options.typingsOptions.sourceRoot)
      ) {
        this._options.typingsOptions.sourceRoot = path.resolve(
          compiler.context,
          this._options.typingsOptions.sourceRoot
        );
      }
    }

    // https://github.com/webpack/webpack-dev-server/pull/1929/files#diff-15fb51940da53816af13330d8ce69b4eR66
    const isWebpackDevServer: boolean = process.env.WEBPACK_DEV_SERVER === 'true';

    const errors: Error[] = this._initializeAndValidateOptions(compiler.options, isWebpackDevServer);

    let typingsPreprocessor: TypingsGenerator | undefined;
    if (this._options.typingsOptions) {
      typingsPreprocessor = new TypingsGenerator({
        srcFolder: this._options.typingsOptions.sourceRoot || compiler.context,
        generatedTsFolder: this._options.typingsOptions.generatedTsFolder,
        exportAsDefault: this._options.exportAsDefault,
        filesToIgnore: this._options.filesToIgnore
      });
    } else {
      typingsPreprocessor = undefined;
    }

    const webpackConfigurationUpdaterOptions: IWebpackConfigurationUpdaterOptions = {
      pluginInstance: this,
      configuration: compiler.options,
      filesToIgnore: this._filesToIgnore,
      localeNameOrPlaceholder: this._localeNamePlaceholder.value,
      exportAsDefault: !!this._options.exportAsDefault
    };

    if (errors.length > 0) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
        compilation.errors.push(...errors);
      });

      WebpackConfigurationUpdater.amendWebpackConfigurationForInPlaceLocFiles(webpackConfigurationUpdaterOptions);

      return;
    }

    function tryInstallPreprocessor(): void {
      if (typingsPreprocessor) {
        compiler.hooks.beforeRun.tap(PLUGIN_NAME, () => typingsPreprocessor!.generateTypings());
      }
    }

    if (isWebpackDevServer) {
      if (typingsPreprocessor) {
        compiler.hooks.watchRun.tap(PLUGIN_NAME, () => typingsPreprocessor!.runWatcher());

        if (!compiler.options.plugins) {
          compiler.options.plugins = [];
        }

        compiler.options.plugins.push(new Webpack.WatchIgnorePlugin([this._options.typingsOptions!.generatedTsFolder]));
      }

      WebpackConfigurationUpdater.amendWebpackConfigurationForInPlaceLocFiles(webpackConfigurationUpdaterOptions);
    } else {
      tryInstallPreprocessor();

      WebpackConfigurationUpdater.amendWebpackConfigurationForMultiLocale(webpackConfigurationUpdaterOptions);

      if (errors.length === 0) {
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
          (compilation.mainTemplate as unknown as IExtendedMainTemplate).hooks.localVars.tap(
            PLUGIN_NAME,
            (source: string, chunk: Webpack.compilation.Chunk, hash: string) => {
              return source.replace(Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX, this._localeNamePlaceholder.value);
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
                compiler.options.output.chunkFilename.indexOf(Constants.LOCALE_FILENAME_PLACEHOLDER) === -1
              )
            ) {
              compilation.errors.push(new Error(
                'The configuration.output.chunkFilename property must be provided and must include ' +
                `the ${Constants.LOCALE_FILENAME_PLACEHOLDER} placeholder`
              ));

              return;
            }

            for (const chunk of chunkGroup.chunks) {
              const chunkFilesSet: Set<string> = new Set(chunk.files);
              for (const chunkFileName of chunk.files) {
                if (
                  chunkFileName.match(Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX) && // Ensure this is expected to be localized
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
                  chunkFilesSet.delete(chunkFileName);

                  const localizedChunkAssets: { [locale: string]: string } = {};
                  for (const [locale, newAsset] of resultingAssets) {
                    compilation.assets[newAsset.filename] = newAsset.asset;
                    localizedChunkAssets[locale] = newAsset.filename;
                    chunkFilesSet.add(newAsset.filename);
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

              chunk.files = Array.from(chunkFilesSet);
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

  /**
   * @internal
   */
  public addDefaultLocFile(locFilePath: string, locFile: ILocFile): void {
    const locFileData: ILocaleFileData = {};
    for (const stringName in locFile) { // eslint-disable-line guard-for-in
      locFileData[stringName] = locFile[stringName].value;
    }

    this._addLocFile(this._defaultLocale, locFilePath, locFileData);

    this._pseudolocalizers.forEach((pseudolocalizer: (str: string) => string, pseudolocaleName: string) => {
      const pseudolocFileData: ILocaleFileData = {};

      for (const stringName in locFileData) {
        if (locFileData.hasOwnProperty(stringName)) {
          pseudolocFileData[stringName] = pseudolocalizer(locFileData[stringName]);
        }
      }

      this._addLocFile(pseudolocaleName, locFilePath, pseudolocFileData);
    });
  }

  private _addLocFile(localeName: string, locFilePath: string, locFileData: ILocaleFileData): void {
    const filesMap: Map<string, Map<string, string>> = this._resolvedLocalizedStrings.get(localeName)!;

    const stringsMap: Map<string, string> = new Map<string, string>();
    filesMap.set(locFilePath, stringsMap);

    for (const stringName in locFileData) {
      if (locFileData.hasOwnProperty(stringName)) {
        const stringKey: string = `${locFilePath}?${stringName}`;
        if (!this.stringKeys.has(stringKey)) {
          const placeholder: IStringPlaceholder = this._getPlaceholderString();
          this.stringKeys.set(stringKey, placeholder);
          this._placeholderToLocFilePathMap.set(placeholder.suffix, locFilePath);
          this._placeholderToStringNameMap.set(placeholder.suffix, stringName);
        }

        const placeholder: IStringPlaceholder = this.stringKeys.get(stringKey)!;
        if (!this._stringPlaceholderMap.has(placeholder.suffix)) {
          this._stringPlaceholderMap.set(
            placeholder.suffix,
            {
              [this._passthroughLocaleName]: stringName
            }
          );
        }

        const stringValue: string = locFileData[stringName];

        this._stringPlaceholderMap.get(placeholder.suffix)![localeName] = stringValue;

        stringsMap.set(stringName, stringValue);
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
      stringName: string;
      locFilePath: string;
    }

    const placeholderPrefix: string = Constants.STRING_PLACEHOLDER_PREFIX;
    const placeholderRegex: RegExp = new RegExp(
      // The maximum length of quotemark escaping we can support is the length of the placeholder prefix
      `${placeholderPrefix}_((?:.){1,${placeholderPrefix.length}})_(\\d+)`,
      'g'
    );
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
          quotemarkCharacter: quotemark !== '"' ? quotemark : undefined,
          locFilePath: this._placeholderToLocFilePathMap.get(placeholderSerialNumber)!,
          stringName: this._placeholderToStringNameMap.get(placeholderSerialNumber)!,
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

    const issues: string[] = [];
    for (const locale of this._locales) {
      const reconstruction: string[] = [];

      let sizeDiff: number = 0;
      for (const element of reconstructionSeries) {
        if (element.kind === 'static') {
          reconstruction.push((element as IStaticReconstructionElement).staticString);
        } else {
          const localizedElement: ILocalizedReconstructionElement = element as ILocalizedReconstructionElement;
          let newValue: string | undefined = localizedElement.values[locale];
          if (!newValue) {
            if (this._fillMissingTranslationStrings) {
              newValue = localizedElement.values[this._defaultLocale];
            } else {
              issues.push(
                `The string "${localizedElement.stringName}" in "${localizedElement.locFilePath}" is missing in the ` +
                `locale ${locale}`
              );

              newValue = '-- MISSING STRING --';
            }
          }

          if (localizedElement.quotemarkCharacter) {
            // Replace the quotemark character with the correctly-escaped character
            newValue = newValue.replace(/\"/g, localizedElement.quotemarkCharacter)
          }

          reconstruction.push(newValue);
          sizeDiff += (newValue.length - localizedElement.size);
        }
      }

      const resultFilename: string = assetName.replace(Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX, locale);
      const newAssetSource: string = reconstruction.join('');
      const newAssetSize: number = asset.size() + sizeDiff;
      const newAsset: IAsset = lodash.clone(asset);
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

    if (issues.length > 0) {
      compilation.errors.push(Error(
        `localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`
      ));
    }

    return result;
  }

  private _initializeAndValidateOptions(configuration: Webpack.Configuration, isWebpackDevServer: boolean): Error[] {
    const errors: Error[] = [];

    // START configuration
    if (
      !configuration.output ||
      !configuration.output.filename ||
      (typeof configuration.output.filename !== 'string') ||
      configuration.output.filename.indexOf(Constants.LOCALE_FILENAME_PLACEHOLDER) === -1
    ) {
      errors.push(new Error(
        'The configuration.output.filename property must be provided, must be a string, and must include ' +
        `the ${Constants.LOCALE_FILENAME_PLACEHOLDER} placeholder`
      ));
    }
    // END configuration

    // START options.filesToIgnore
    { // eslint-disable-line no-lone-blocks
      for (const filePath of this._options.filesToIgnore || []) {
        const normalizedFilePath: string = path.resolve(configuration.context!, filePath);
        this._filesToIgnore.add(normalizedFilePath);
      }
    }
    // END options.filesToIgnore

    // START options.localizedData
    if (this._options.localizedData) {
      const localeNameMap: { [localeName: string]: string } = {};

      // Create a special placeholder for the locale's name
      this._localeNamePlaceholder = this._getPlaceholderString();
      this._stringPlaceholderMap.set(this._localeNamePlaceholder.suffix, localeNameMap);

      // START options.localizedData.passthroughLocale
      if (this._options.localizedData.passthroughLocale) {
        const {
          usePassthroughLocale,
          passthroughLocaleName = 'passthrough'
        } = this._options.localizedData.passthroughLocale;
        if (usePassthroughLocale) {
          this._passthroughLocaleName = passthroughLocaleName;
          this._locales.add(passthroughLocaleName);
          this._stringPlaceholderMap.get(this._localeNamePlaceholder.suffix)![passthroughLocaleName] = passthroughLocaleName;
        }
      }
      // END options.localizedData.passthroughLocale

      // START options.localizedData.translatedStrings
      const { translatedStrings } = this._options.localizedData;
      if (translatedStrings) {
        const localeNameRegex: RegExp = /[a-z-]/i;

        for (const localeName in translatedStrings) {
          if (translatedStrings.hasOwnProperty(localeName)) {
            if (this._locales.has(localeName)) {
              errors.push(Error(
                `The locale "${localeName}" appears multiple times. ` +
                'There may be multiple instances with different casing.'
              ));
              return errors;
            }

            if (!localeName.match(localeNameRegex)) {
              errors.push(new Error(
                 `Invalid locale name: ${localeName}. Locale names may only contain letters and hyphens.`
              ));
              return errors;
            }

            this._locales.add(localeName);
            localeNameMap[localeName] = localeName;

            this._resolvedLocalizedStrings.set(localeName, new Map<string, Map<string, string>>());

            const locFilePathsInLocale: Set<string> = new Set<string>();

            const locale: ILocaleData = translatedStrings[localeName];
            for (const locFilePath in locale) {
              if (locale.hasOwnProperty(locFilePath)) {
                const normalizedLocFilePath: string = path.resolve(configuration.context!, locFilePath);

                if (locFilePathsInLocale.has(normalizedLocFilePath)) {
                  errors.push(new Error(
                    `The localization file path "${locFilePath}" appears multiple times in locale ${localeName}. ` +
                    'There may be multiple instances with different casing.'
                  ));
                  return errors;
                }

                locFilePathsInLocale.add(normalizedLocFilePath);

                const locFileData: ILocaleFileData = locale[locFilePath];
                this._addLocFile(localeName, normalizedLocFilePath, locFileData);
              }
            }
          }
        }
      }
      // END options.localizedData.translatedStrings

      // START options.localizedData.defaultLocale
      if (this._options.localizedData.defaultLocale) {
        const { localeName, fillMissingTranslationStrings } = this._options.localizedData.defaultLocale;
        if (this._options.localizedData.defaultLocale.localeName) {
          if (this._locales.has(localeName)) {
            throw new Error('The default locale is also specified in the translated strings.');
          }

          this._locales.add(localeName);
          this._resolvedLocalizedStrings.set(localeName, new Map<string, Map<string, string>>());
          localeNameMap[localeName] = localeName;
          this._defaultLocale = localeName;
          this._fillMissingTranslationStrings = !!fillMissingTranslationStrings;
        } else {
          throw new Error('Missing default locale name');
        }
      } else {
        throw new Error('Missing default locale options.')
      }
      // END options.localizedData.defaultLocale

      // START options.localizedData.pseudoLocales
      if (this._options.localizedData.pseudolocales) {
        for (const pseudolocaleName in this._options.localizedData.pseudolocales) {
          if (this._options.localizedData.pseudolocales.hasOwnProperty(pseudolocaleName)) {
            if (this._defaultLocale === pseudolocaleName) {
              throw new Error(`A pseudolocale (${pseudolocaleName}) name is also the default locale name.`);
            }

            if (this._locales.has(pseudolocaleName)) {
              throw new Error(`A pseudolocale (${pseudolocaleName}) name is also specified in the translated strings.`);
            }

            const pseudoLocaleOpts: IPseudolocaleOptions = this._options.localizedData.pseudolocales[pseudolocaleName];
            this._pseudolocalizers.set(pseudolocaleName, Pseudolocalization.getPseudolocalizer(pseudoLocaleOpts));
            this._locales.add(pseudolocaleName);
            this._resolvedLocalizedStrings.set(pseudolocaleName, new Map<string, Map<string, string>>());
            localeNameMap[pseudolocaleName] = pseudolocaleName;
          }
        }
      }
      // END options.localizedData.pseudoLocales
    } else if (!isWebpackDevServer) {
      throw new Error('Localized data must be provided unless webpack dev server is running.');
    }
    // END options.localizedStrings

    return errors;
  }

  private _getPlaceholderString(): IStringPlaceholder {
    const suffix: string = (this._stringPlaceholderCounter++).toString();
    return {
      value: `${Constants.STRING_PLACEHOLDER_PREFIX}_"_${suffix}`,
      suffix: suffix
    };
  }
}
