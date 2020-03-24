// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  JsonFile,
  FileSystem,
  ITerminalProvider,
  TerminalProviderSeverity,
  Terminal
} from '@rushstack/node-core-library';
import * as Webpack from 'webpack';
import * as path from 'path';
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
  ILocalizationFile,
  IPseudolocaleOptions,
  ILocaleElementMap
} from './interfaces';
import {
  ILocalizedWebpackChunk
} from './webpackInterfaces';
import { LocFileTypingsGenerator } from './LocFileTypingsGenerator';
import { Pseudolocalization } from './Pseudolocalization';
import { EntityMarker } from './utilities/EntityMarker';
import { IAsset, IProcessAssetResult, AssetProcessor } from './AssetProcessor';
import { LocFileParser } from './utilities/LocFileParser';

/**
 * @internal
 */
export interface IStringPlaceholder {
  value: string;
  suffix: string;
}

interface IExtendedMainTemplate {
  hooks: {
    assetPath: Tapable.SyncHook<string, IAssetPathOptions>;
  };
}

interface IExtendedConfiguration extends Webpack.compilation.Compilation {
  options: Webpack.Configuration;
}

interface IExtendedChunkGroup extends Webpack.compilation.ChunkGroup {
  getChildren(): Webpack.compilation.Chunk[];
}

interface IExtendedChunk extends Webpack.compilation.Chunk {
  filenameTemplate: string;
}

interface IAssetPathOptions {
  chunk: Webpack.compilation.Chunk;
  contentHashType: string;
}

/**
 * @internal
 */
export interface IStringSerialNumberData {
  values: ILocaleElementMap;
  locFilePath: string;
  stringName: string;
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
  private _stringPlaceholderMap: Map<string, IStringSerialNumberData> = new Map<string, IStringSerialNumberData>();
  private _locales: Set<string> = new Set<string>();
  private _passthroughLocaleName: string;
  private _defaultLocale: string;
  private _noStringsLocaleName: string;
  private _fillMissingTranslationStrings: boolean;
  private _pseudolocalizers: Map<string, (str: string) => string> = new Map<string, (str: string) => string>();

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

    const { errors, warnings } = this._initializeAndValidateOptions(compiler.options, isWebpackDevServer);

    let typingsPreprocessor: LocFileTypingsGenerator | undefined;
    if (this._options.typingsOptions) {
      typingsPreprocessor = new LocFileTypingsGenerator({
        srcFolder: this._options.typingsOptions.sourceRoot || compiler.context,
        generatedTsFolder: this._options.typingsOptions.generatedTsFolder,
        exportAsDefault: this._options.typingsOptions.exportAsDefault,
        filesToIgnore: this._options.filesToIgnore
      });
    } else {
      typingsPreprocessor = undefined;
    }

    const webpackConfigurationUpdaterOptions: IWebpackConfigurationUpdaterOptions = {
      pluginInstance: this,
      configuration: compiler.options,
      filesToIgnore: this._filesToIgnore,
      localeNameOrPlaceholder: Constants.LOCALE_NAME_PLACEHOLDER
    };

    if (errors.length > 0 || warnings.length > 0) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
        compilation.errors.push(...errors);
        compilation.warnings.push(...warnings);
      });

      if (errors.length > 0) {
        // If there are any errors, just pass through the resources in source and don't do any
        // additional configuration
        WebpackConfigurationUpdater.amendWebpackConfigurationForInPlaceLocFiles(webpackConfigurationUpdaterOptions);
        return;
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
      if (typingsPreprocessor) {
        compiler.hooks.beforeRun.tap(PLUGIN_NAME, () => typingsPreprocessor!.generateTypings());
      }

      WebpackConfigurationUpdater.amendWebpackConfigurationForMultiLocale(webpackConfigurationUpdaterOptions);

      if (errors.length === 0) {
        compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: IExtendedConfiguration) => {
          (compilation.mainTemplate as unknown as IExtendedMainTemplate).hooks.assetPath.tap(
            PLUGIN_NAME,
            (assetPath: string, options: IAssetPathOptions) => {
              if (
                options.contentHashType === 'javascript' &&
                assetPath.match(Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX)
              ) {
                // Does this look like an async chunk URL generator?
                if (typeof options.chunk.id === 'string' && options.chunk.id.match(/^\" \+/)) {
                  return assetPath.replace(
                    Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
                    `" + ${Constants.JSONP_PLACEHOLDER} + "`
                  );
                } else {
                  return assetPath.replace(
                    Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
                    Constants.LOCALE_NAME_PLACEHOLDER
                  );
                }
              } else {
                return assetPath;
              }
            }
          );

          compilation.hooks.optimizeChunks.tap(
            PLUGIN_NAME,
            (chunks: IExtendedChunk[], chunkGroups: IExtendedChunkGroup[]) => {
              let chunksHaveAnyChildren: boolean = false;
              for (const chunkGroup of chunkGroups) {
                const children: Webpack.compilation.Chunk[] = chunkGroup.getChildren();
                if (children.length > 0) {
                  chunksHaveAnyChildren = true;
                  break;
                }
              }

              if (
                chunksHaveAnyChildren && (
                  !compilation.options.output ||
                  !compilation.options.output.chunkFilename ||
                  compilation.options.output.chunkFilename.indexOf(Constants.LOCALE_FILENAME_PLACEHOLDER) === -1
                )
              ) {
                compilation.errors.push(new Error(
                  'The configuration.output.chunkFilename property must be provided and must include ' +
                  `the ${Constants.LOCALE_FILENAME_PLACEHOLDER} placeholder`
                ));

                return;
              }

              for (const chunk of chunks) {
                // See if the chunk contains any localized modules or loads any localized chunks
                const localizedChunk: boolean = this._chunkHasLocalizedModules(chunk);

                // Change the chunk's name to include either the locale name or the locale name for chunks without strings
                const replacementValue: string = localizedChunk
                  ? Constants.LOCALE_NAME_PLACEHOLDER
                  : this._noStringsLocaleName;
                if (chunk.hasRuntime()) {
                  chunk.filenameTemplate = (compilation.options.output!.filename as string).replace(
                    Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
                    replacementValue
                  );
                } else {
                  chunk.filenameTemplate = compilation.options.output!.chunkFilename!.replace(
                    Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
                    replacementValue
                  );
                }
              }
            }
          );
        });

        compiler.hooks.emit.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
          const localizationStats: ILocalizationStats = {
            entrypoints: {},
            namedChunkGroups: {}
          };

          const alreadyProcessedAssets: Set<string> = new Set<string>();

          for (const untypedChunk of compilation.chunks) {
            const chunk: ILocalizedWebpackChunk = untypedChunk;
            const chunkFilesSet: Set<string> = new Set(chunk.files);
            function processChunkJsFile(callback: (chunkFilename: string) => void): void {
              let alreadyProcessedAFileInThisChunk: boolean = false;
              for (const chunkFilename of chunk.files) {
                if (
                  chunkFilename.endsWith('.js') && // Ensure this is a JS file
                  !alreadyProcessedAssets.has(chunkFilename) // Ensure this isn't a vendor chunk we've already processed
                ) {
                  if (alreadyProcessedAFileInThisChunk) {
                    throw new Error(`Found more than one JS file in chunk "${chunk.name}". This is not expected.`);
                  }

                  alreadyProcessedAFileInThisChunk = true;
                  alreadyProcessedAssets.add(chunkFilename);
                  callback(chunkFilename);
                }
              }
            }

            if (this._chunkHasLocalizedModules(chunk)) {
              processChunkJsFile((chunkFilename) => {
                if (chunkFilename.indexOf(Constants.LOCALE_NAME_PLACEHOLDER) === -1) {
                  throw new Error(`Asset ${chunkFilename} is expected to be localized, but is missing a locale placeholder`);
                }

                const asset: IAsset = compilation.assets[chunkFilename];

                const resultingAssets: Map<string, IProcessAssetResult> = AssetProcessor.processLocalizedAsset({
                  plugin: this,
                  compilation,
                  assetName: chunkFilename,
                  asset,
                  chunk,
                  locales: this._locales,
                  noStringsLocaleName: this._noStringsLocaleName,
                  fillMissingTranslationStrings: this._fillMissingTranslationStrings,
                  defaultLocale: this._defaultLocale
                });

                // Delete the existing asset because it's been renamed
                delete compilation.assets[chunkFilename];
                chunkFilesSet.delete(chunkFilename);

                const localizedChunkAssets: ILocaleElementMap = {};
                for (const [locale, newAsset] of resultingAssets) {
                  compilation.assets[newAsset.filename] = newAsset.asset;
                  localizedChunkAssets[locale] = newAsset.filename;
                  chunkFilesSet.add(newAsset.filename);
                }

                if (chunk.hasRuntime()) {
                  // This is an entrypoint
                  localizationStats.entrypoints[chunk.name] = {
                    localizedAssets: localizedChunkAssets
                  };
                } else {
                  // This is a secondary chunk
                  if (chunk.name) {
                    localizationStats.namedChunkGroups[chunk.name] = {
                      localizedAssets: localizedChunkAssets
                    };
                  }
                }

                chunk.localizedFiles = localizedChunkAssets;
              });
            } else {
              processChunkJsFile((chunkFilename) => {
                const asset: IAsset = compilation.assets[chunkFilename];

                const resultingAsset: IProcessAssetResult = AssetProcessor.processNonLocalizedAsset({
                  plugin: this,
                  compilation,
                  assetName: chunkFilename,
                  asset,
                  chunk,
                  noStringsLocaleName: this._noStringsLocaleName
                });

                // Delete the existing asset because it's been renamed
                delete compilation.assets[chunkFilename];
                chunkFilesSet.delete(chunkFilename);

                compilation.assets[resultingAsset.filename] = resultingAsset.asset;
                chunkFilesSet.add(resultingAsset.filename);
              });
            }

            chunk.files = Array.from(chunkFilesSet);
          }

          if (this._options.localizationStats) {
            if (this._options.localizationStats.dropPath) {
              const resolvedLocalizationStatsDropPath: string = path.resolve(
                compiler.outputPath,
                this._options.localizationStats.dropPath
              );
              JsonFile.save(localizationStats, resolvedLocalizationStatsDropPath, { ensureFolderExists: true });
            }

            if (this._options.localizationStats.callback) {
              try {
                this._options.localizationStats.callback(localizationStats);
              } catch (e) {
                /* swallow errors from the callback */
              }
            }
          }
        });
      }
    }
  }

  /**
   * @internal
   */
  public addDefaultLocFile(locFilePath: string, locFile: ILocalizationFile): void {
    const locFileData: ILocaleFileData = this._convertLocalizationFileToLocData(locFile);
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

  /**
   * @internal
   */
  public getDataForSerialNumber(serialNumber: string): IStringSerialNumberData | undefined {
    return this._stringPlaceholderMap.get(serialNumber);
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
        }

        const placeholder: IStringPlaceholder = this.stringKeys.get(stringKey)!;
        if (!this._stringPlaceholderMap.has(placeholder.suffix)) {
          this._stringPlaceholderMap.set(
            placeholder.suffix,
            {
              values: {
                [this._passthroughLocaleName]: stringName
              },
              locFilePath: locFilePath,
              stringName: stringName
            }
          );
        }

        const stringValue: string = locFileData[stringName];

        this._stringPlaceholderMap.get(placeholder.suffix)!.values[localeName] = stringValue;

        stringsMap.set(stringName, stringValue);
      }
    }
  }

  private _initializeAndValidateOptions(
    configuration: Webpack.Configuration,
    isWebpackDevServer: boolean
  ): { errors: Error[], warnings: Error[] } {
    const errors: Error[] = [];
    const warnings: Error[] = [];

    function ensureValidLocaleName(localeName: string): boolean {
      const LOCALE_NAME_REGEX: RegExp = /[a-z-]/i;
      if (!localeName.match(LOCALE_NAME_REGEX)) {
        errors.push(new Error(
          `Invalid locale name: ${localeName}. Locale names may only contain letters and hyphens.`
        ));
        return false;
      } else {
        return true;
      }
    }

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
      // START options.localizedData.passthroughLocale
      if (this._options.localizedData.passthroughLocale) {
        const {
          usePassthroughLocale,
          passthroughLocaleName = 'passthrough'
        } = this._options.localizedData.passthroughLocale;
        if (usePassthroughLocale) {
          this._passthroughLocaleName = passthroughLocaleName;
          this._locales.add(passthroughLocaleName);
        }
      }
      // END options.localizedData.passthroughLocale

      // START options.localizedData.translatedStrings
      const { translatedStrings } = this._options.localizedData;
      if (translatedStrings) {
        const terminalProvider: ITerminalProvider = {
          supportsColor: false,
          eolCharacter: '\n',
          write: (data: string, severity: TerminalProviderSeverity) => {
            switch (severity) {
              case TerminalProviderSeverity.error: {
                errors.push(new Error(data));
                break;
              }

              case TerminalProviderSeverity.warning: {
                warnings.push(new Error(data));
                break;
              }
            }
          }
        };
        const terminal: Terminal = new Terminal(terminalProvider);

        for (const localeName in translatedStrings) {
          if (translatedStrings.hasOwnProperty(localeName)) {
            if (this._locales.has(localeName)) {
              errors.push(Error(
                `The locale "${localeName}" appears multiple times. ` +
                'There may be multiple instances with different casing.'
              ));
              return { errors, warnings };
            }

            if (!ensureValidLocaleName(localeName)) {
              return { errors, warnings };
            }

            this._locales.add(localeName);

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
                  return { errors, warnings };
                }

                locFilePathsInLocale.add(normalizedLocFilePath);

                let locFileData: ILocaleFileData;
                const locFileDataFromOptions: ILocaleFileData | string = locale[locFilePath];
                if (typeof locFileDataFromOptions === 'string') {
                  const normalizedTranslatedFilePath: string = path.resolve(configuration.context!, locFileDataFromOptions);
                  const localizationFile: ILocalizationFile = LocFileParser.parseLocFile({
                    filePath: normalizedTranslatedFilePath,
                    content: FileSystem.readFile(normalizedTranslatedFilePath),
                    terminal: terminal
                  });

                  locFileData = this._convertLocalizationFileToLocData(localizationFile);
                } else {
                  locFileData = locFileDataFromOptions;
                }
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
            errors.push(new Error('The default locale is also specified in the translated strings.'));
            return { errors, warnings };
          } else if (!ensureValidLocaleName(localeName)) {
            return { errors, warnings };
          }

          this._locales.add(localeName);
          this._resolvedLocalizedStrings.set(localeName, new Map<string, Map<string, string>>());
          this._defaultLocale = localeName;
          this._fillMissingTranslationStrings = !!fillMissingTranslationStrings;
        } else {
          errors.push(new Error('Missing default locale name'));
          return { errors, warnings };
        }
      } else {
        errors.push(new Error('Missing default locale options.'));
        return { errors, warnings };
      }
      // END options.localizedData.defaultLocale

      // START options.localizedData.pseudoLocales
      if (this._options.localizedData.pseudolocales) {
        for (const pseudolocaleName in this._options.localizedData.pseudolocales) {
          if (this._options.localizedData.pseudolocales.hasOwnProperty(pseudolocaleName)) {
            if (this._defaultLocale === pseudolocaleName) {
              errors.push(new Error(`A pseudolocale (${pseudolocaleName}) name is also the default locale name.`));
              return { errors, warnings };
            }

            if (this._locales.has(pseudolocaleName)) {
              errors.push(new Error(
                `A pseudolocale (${pseudolocaleName}) name is also specified in the translated strings.`
              ));
              return { errors, warnings };
            }

            const pseudoLocaleOpts: IPseudolocaleOptions = this._options.localizedData.pseudolocales[pseudolocaleName];
            this._pseudolocalizers.set(pseudolocaleName, Pseudolocalization.getPseudolocalizer(pseudoLocaleOpts));
            this._locales.add(pseudolocaleName);
            this._resolvedLocalizedStrings.set(pseudolocaleName, new Map<string, Map<string, string>>());
          }
        }
      }
      // END options.localizedData.pseudoLocales
    } else if (!isWebpackDevServer) {
      throw new Error('Localized data must be provided unless webpack dev server is running.');
    }
    // END options.localizedData

    // START options.noStringsLocaleName
    if (
      this._options.noStringsLocaleName === undefined ||
      this._options.noStringsLocaleName === null ||
      !ensureValidLocaleName(this._options.noStringsLocaleName)
    ) {
      this._noStringsLocaleName = 'none';
    } else {
      this._noStringsLocaleName = this._options.noStringsLocaleName;
    }
    // END options.noStringsLocaleName

    return { errors, warnings };
  }

  /**
   * @param token - Use this as a value that may be escaped or minified.
   */
  private _getPlaceholderString(): IStringPlaceholder {
    const suffix: string = (this._stringPlaceholderCounter++).toString();
    return {
      value: `${Constants.STRING_PLACEHOLDER_PREFIX}_${Constants.STRING_PLACEHOLDER_LABEL}_${suffix}`,
      suffix: suffix
    };
  }

  private _chunkHasLocalizedModules(chunk: Webpack.compilation.Chunk): boolean {
    if (EntityMarker.getMark(chunk) === undefined) {
      let chunkHasAnyLocModules: boolean = false;
      if (!chunkHasAnyLocModules) {
        for (const module of chunk.getModules()) {
          if (EntityMarker.getMark(module)) {
            chunkHasAnyLocModules = true;
            break;
          }
        }
      }

      // Check async chunks if this is a runtime chunk and we haven't directly found any localized modules
      if (chunk.hasRuntime() && !chunkHasAnyLocModules) {
        for (const asyncChunk of chunk.getAllAsyncChunks()) {
          if (this._chunkHasLocalizedModules(asyncChunk)) {
            chunkHasAnyLocModules = true;
            break;
          }
        }
      }

      EntityMarker.markEntity(chunk, chunkHasAnyLocModules);
    }

    return EntityMarker.getMark(chunk)!;
  }

  private _convertLocalizationFileToLocData(locFile: ILocalizationFile): ILocaleFileData {
    const locFileData: ILocaleFileData = {};
    for (const stringName in locFile) { // eslint-disable-line guard-for-in
      locFileData[stringName] = locFile[stringName].value;
    }

    return locFileData;
  }
}
