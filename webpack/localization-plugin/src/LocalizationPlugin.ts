// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, FileSystem, ITerminal, NewlineKind } from '@rushstack/node-core-library';
import * as Webpack from 'webpack';
import type { Source } from 'webpack-sources';
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
  ILocalizationFile,
  IResolvedMissingTranslations
} from './interfaces';
import { ILocalizedWebpackChunk } from './webpackInterfaces';
import { LocFileTypingsGenerator } from './LocFileTypingsGenerator';
import { Pseudolocalization } from './Pseudolocalization';
import { EntityMarker } from './utilities/EntityMarker';
import { IAssetManifest, IAssetPathOptions, AssetProcessor, PLACEHOLDER_REGEX } from './AssetProcessor';
import { LocFileParser } from './utilities/LocFileParser';

/**
 * @internal
 */
export interface IStringPlaceholder {
  value: string;
  suffix: string;
  values: Map<string, string>;
  locFilePath: string;
  stringName: string;
}

/**
 * @internal
 */
export interface IAddDefaultLocFileResult {
  /**
   * A list of paths to translation files that were loaded
   */
  additionalLoadedFilePaths: string[];

  errors: Error[];
}

interface IRenderManifestOptions {
  chunk: Webpack.compilation.Chunk;
  outputOptions: Webpack.compilation.Compilation['outputOptions'];
}

interface IExtendedMainTemplate {
  hooks: {
    assetPath: Tapable.SyncHook<string, IAssetPathOptions>;
    renderManifest: Tapable.SyncHook<IAssetManifest[], IRenderManifestOptions>;
  };
}

interface IExtendedConfiguration extends Webpack.compilation.Compilation {
  options: Webpack.Configuration;
}

interface IExtendedChunkGroup extends Webpack.compilation.ChunkGroup {
  getChildren(): Webpack.compilation.Chunk[];
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
  private readonly _stringKeys: Map<string, IStringPlaceholder> = new Map();

  private readonly _options: ILocalizationPluginOptions;
  private readonly _resolvedTranslatedStringsFromOptions: Map<string, Map<string, ILocaleFileData | string>> =
    new Map();
  private _globsToIgnore: string[] | undefined;
  private _stringPlaceholderCounter: number = 0;
  private readonly _stringPlaceholderMap: Map<string, IStringPlaceholder> = new Map();
  private _passthroughLocaleName!: string;
  private _defaultLocale!: string;
  private _noStringsLocaleName!: string;
  private _fillMissingTranslationStrings!: boolean;
  private readonly _pseudolocalizers: Map<string, (str: string) => string> = new Map();
  private _resxNewlineNormalization: NewlineKind | undefined;

  /**
   * The outermost map's keys are the locale names.
   * The middle map's keys are the resolved, file names.
   * The innermost map's keys are the string identifiers and its values are the string values.
   */
  private _resolvedLocalizedStrings: Map<string, Map<string, Map<string, string>>> = new Map();

  public constructor(options: ILocalizationPluginOptions) {
    if (options.filesToIgnore) {
      throw new Error('The filesToIgnore option is no longer supported. Please use globsToIgnore instead.');
    }

    this._options = options;
  }

  public apply(compiler: Webpack.Compiler): void {
    const isWebpack4: boolean = !!compiler.hooks;

    if (!isWebpack4) {
      throw new Error(`The ${LocalizationPlugin.name} plugin requires Webpack 4`);
    }

    const { typingsOptions } = this._options;

    if (typingsOptions && compiler.context) {
      if (typingsOptions.generatedTsFolder && !path.isAbsolute(typingsOptions.generatedTsFolder)) {
        typingsOptions.generatedTsFolder = path.resolve(compiler.context, typingsOptions.generatedTsFolder);
      }

      if (typingsOptions.sourceRoot && !path.isAbsolute(typingsOptions.sourceRoot)) {
        typingsOptions.sourceRoot = path.resolve(compiler.context, typingsOptions.sourceRoot);
      }
    }

    // https://github.com/webpack/webpack-dev-server/pull/1929/files#diff-15fb51940da53816af13330d8ce69b4eR66
    const isWebpackDevServer: boolean = process.env.WEBPACK_DEV_SERVER === 'true';

    const { errors, warnings } = this._initializeAndValidateOptions(compiler.options, isWebpackDevServer);

    let typingsPreprocessor: LocFileTypingsGenerator | undefined;
    if (typingsOptions) {
      typingsPreprocessor = new LocFileTypingsGenerator({
        srcFolder: typingsOptions.sourceRoot || compiler.context,
        generatedTsFolder: typingsOptions.generatedTsFolder,
        exportAsDefault: typingsOptions.exportAsDefault,
        globsToIgnore: this._options.globsToIgnore
      });
    } else {
      typingsPreprocessor = undefined;
    }

    const webpackConfigurationUpdaterOptions: IWebpackConfigurationUpdaterOptions = {
      pluginInstance: this,
      configuration: compiler.options,
      globsToIgnore: this._globsToIgnore,
      localeNameOrPlaceholder: Constants.LOCALE_NAME_PLACEHOLDER,
      resxNewlineNormalization: this._resxNewlineNormalization
    };

    if (errors.length > 0 || warnings.length > 0) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
        compilation.errors.push(...errors);
        compilation.warnings.push(...warnings);
      });

      if (errors.length > 0) {
        // If there are any errors, just pass through the resources in source and don't do any
        // additional configuration
        WebpackConfigurationUpdater.amendWebpackConfigurationForInPlaceLocFiles(
          webpackConfigurationUpdaterOptions
        );
        return;
      }
    }

    if (isWebpackDevServer) {
      if (typingsPreprocessor) {
        compiler.hooks.afterEnvironment.tap(PLUGIN_NAME, () => typingsPreprocessor!.runWatcherAsync());

        if (!compiler.options.plugins) {
          compiler.options.plugins = [];
        }

        compiler.options.plugins.push(new Webpack.WatchIgnorePlugin([typingsOptions!.generatedTsFolder]));
      }

      WebpackConfigurationUpdater.amendWebpackConfigurationForInPlaceLocFiles(
        webpackConfigurationUpdaterOptions
      );
    } else {
      if (typingsPreprocessor) {
        compiler.hooks.beforeRun.tapPromise(
          PLUGIN_NAME,
          async () => await typingsPreprocessor!.generateTypingsAsync()
        );
      }

      WebpackConfigurationUpdater.amendWebpackConfigurationForMultiLocale(webpackConfigurationUpdaterOptions);

      if (errors.length === 0) {
        compiler.hooks.thisCompilation.tap(
          PLUGIN_NAME,
          (untypedCompilation: Webpack.compilation.Compilation) => {
            const compilation: IExtendedConfiguration = untypedCompilation as IExtendedConfiguration;

            // Side-channel for async chunk URL generator chunk, since the actual chunk is completely inaccessible
            // from the assetPath hook below when invoked to build the async URL generator
            let chunkWithAsyncURLGenerator: Webpack.compilation.Chunk | undefined;

            compilation.mainTemplate.hooks.localVars.tap(
              {
                name: PLUGIN_NAME,
                before: 'JsonpMainTemplatePlugin'
              },
              (content: string, chunk: Webpack.compilation.Chunk) => {
                chunkWithAsyncURLGenerator = chunk;
                return content;
              }
            );

            compilation.mainTemplate.hooks.localVars.tap(
              {
                name: PLUGIN_NAME,
                stage: 10
              },
              (content: string, chunk: Webpack.compilation.Chunk) => {
                // After the JsonpMainTemplatePlugin finishes, clear the value
                chunkWithAsyncURLGenerator = undefined;
                return content;
              }
            );

            (compilation.mainTemplate as unknown as IExtendedMainTemplate).hooks.assetPath.tap(
              PLUGIN_NAME,
              (assetPath: string, options: IAssetPathOptions) => {
                if (
                  options.contentHashType === 'javascript' &&
                  assetPath.match(Constants.LOCALE_FILENAME_TOKEN_REGEX)
                ) {
                  // Does this look like an async chunk URL generator?
                  if (typeof options.chunk.id === 'string' && (options.chunk.id as string).match(/^\" \+/)) {
                    const idsWithStrings: Set<number | string> = new Set<number | string>();
                    const idsWithoutStrings: Set<number | string> = new Set<number | string>();

                    if (!chunkWithAsyncURLGenerator) {
                      compilation.errors.push(
                        new Error(`No active chunk while constructing async chunk URL generator!`)
                      );
                      return;
                    }

                    const asyncChunks: Set<Webpack.compilation.Chunk> =
                      chunkWithAsyncURLGenerator!.getAllAsyncChunks();
                    for (const asyncChunk of asyncChunks) {
                      const chunkId: number | string | null = asyncChunk.id;

                      if (chunkId === null || chunkId === undefined) {
                        throw new Error(`Chunk "${asyncChunk.name}"'s ID is null or undefined.`);
                      }

                      if (this._chunkHasLocalizedModules(asyncChunk)) {
                        idsWithStrings.add(chunkId);
                      } else {
                        idsWithoutStrings.add(chunkId);
                      }
                    }

                    return assetPath.replace(Constants.LOCALE_FILENAME_TOKEN_REGEX, () => {
                      // Use a replacer function so that we don't need to escape anything in the return value

                      // If the runtime chunk is itself localized, forcibly match the locale of the runtime chunk
                      // Otherwise prefer the runtime expression if specified
                      const localeExpression: string =
                        (!this._chunkHasLocalizedModules(chunkWithAsyncURLGenerator!) &&
                          this._options.runtimeLocaleExpression) ||
                        Constants.JSONP_PLACEHOLDER;

                      if (idsWithStrings.size === 0) {
                        return this._noStringsLocaleName;
                      } else if (idsWithoutStrings.size === 0) {
                        return `" + ${localeExpression} + "`;
                      } else {
                        // Generate an object that is used select between <locale> and <nostrings locale> for each chunk ID
                        // Method: pick the smaller set of (localized, non-localized) and map that to 1 (a truthy value)
                        // All other IDs map to `undefined` (a falsy value), so we then use the ternary operator to select
                        // the appropriate token
                        //
                        // This can be improved in the future. We can maybe sort the chunks such that the chunks below a certain ID
                        // number are localized and the those above are not.
                        const chunkMapping: { [chunkId: string]: 1 } = {};
                        // Use the map with the fewest values to shorten the expression
                        const isLocalizedSmaller: boolean = idsWithStrings.size <= idsWithoutStrings.size;
                        // These are the ids for which the expression should evaluate to a truthy value
                        const smallerSet: Set<number | string> = isLocalizedSmaller
                          ? idsWithStrings
                          : idsWithoutStrings;
                        for (const id of smallerSet) {
                          chunkMapping[id] = 1;
                        }

                        const noLocaleExpression: string = JSON.stringify(this._noStringsLocaleName);

                        return `" + (${JSON.stringify(chunkMapping)}[chunkId]?${
                          isLocalizedSmaller ? localeExpression : noLocaleExpression
                        }:${isLocalizedSmaller ? noLocaleExpression : localeExpression}) + "`;
                      }
                    });
                  } else {
                    let locale: string = options.locale;
                    if (!locale) {
                      const isLocalized: boolean = this._chunkHasLocalizedModules(options.chunk);
                      // Ensure that the initial name maps to a file that should exist in the final output
                      locale = isLocalized ? this._defaultLocale : this._noStringsLocaleName;
                    }
                    return assetPath.replace(Constants.LOCALE_FILENAME_TOKEN_REGEX, locale);
                  }
                } else if (assetPath.match(Constants.NO_LOCALE_SOURCE_MAP_FILENAME_TOKEN_REGEX)) {
                  // Replace the placeholder with the [locale] token for sourcemaps
                  const deLocalizedFilename: string = options.filename.replace(
                    PLACEHOLDER_REGEX,
                    Constants.LOCALE_FILENAME_TOKEN
                  );
                  return assetPath.replace(
                    Constants.NO_LOCALE_SOURCE_MAP_FILENAME_TOKEN_REGEX,
                    deLocalizedFilename
                  );
                } else {
                  return assetPath;
                }
              }
            );

            compilation.hooks.optimizeChunks.tap(
              PLUGIN_NAME,
              (
                untypedChunks: Webpack.compilation.Chunk[],
                untypedChunkGroups: Webpack.compilation.ChunkGroup[]
              ) => {
                const chunkGroups: IExtendedChunkGroup[] = untypedChunkGroups as IExtendedChunkGroup[];

                let chunksHaveAnyChildren: boolean = false;
                for (const chunkGroup of chunkGroups) {
                  const children: Webpack.compilation.Chunk[] = chunkGroup.getChildren();
                  if (children.length > 0) {
                    chunksHaveAnyChildren = true;
                    break;
                  }
                }

                if (
                  chunksHaveAnyChildren &&
                  (!compilation.options.output ||
                    !compilation.options.output.chunkFilename ||
                    compilation.options.output.chunkFilename.indexOf(Constants.LOCALE_FILENAME_TOKEN) === -1)
                ) {
                  compilation.errors.push(
                    new Error(
                      'The configuration.output.chunkFilename property must be provided and must include ' +
                        `the ${Constants.LOCALE_FILENAME_TOKEN} placeholder`
                    )
                  );

                  return;
                }
              }
            );

            const { outputOptions } = compilation;

            // For compatibility with minifiers, need to generate the additional assets after the optimize process runs
            compilation.hooks.optimizeChunkAssets.tapPromise(
              PLUGIN_NAME,
              async (chunks: Webpack.compilation.Chunk[]): Promise<void> => {
                const locales: Set<string> = new Set(this._resolvedLocalizedStrings.keys());

                for (const chunk of chunks) {
                  const isLocalized: boolean = this._chunkHasLocalizedModules(chunk);

                  const template: string =
                    chunk.filenameTemplate ||
                    (chunk.hasRuntime() ? outputOptions.filename : outputOptions.chunkFilename);

                  const defaultAssetName: string = compilation.getPath(template, {
                    chunk,
                    contentHashType: 'javascript'
                    // Without locale this should return the name of the default asset
                  });

                  const asset: Source = compilation.assets[defaultAssetName];
                  if (!asset) {
                    compilation.errors.push(new Error(`Missing expected chunk asset ${defaultAssetName}`));
                    continue;
                  }

                  if (isLocalized) {
                    AssetProcessor.processLocalizedAsset({
                      // Global values
                      plugin: this,
                      compilation,
                      locales,
                      defaultLocale: this._defaultLocale,
                      fillMissingTranslationStrings: this._fillMissingTranslationStrings,
                      // Chunk-specific values
                      chunk,
                      source: asset,
                      filenameTemplate: template
                    });
                  } else {
                    AssetProcessor.processNonLocalizedAsset({
                      // Global values
                      plugin: this,
                      compilation,
                      noStringsLocaleName: this._noStringsLocaleName,
                      // Chunk-specific values
                      chunk,
                      source: asset,
                      fileName: defaultAssetName
                    });
                  }
                }
              }
            );
          }
        );

        compiler.hooks.emit.tap(PLUGIN_NAME, (compilation: Webpack.compilation.Compilation) => {
          const localizationStats: ILocalizationStats = {
            entrypoints: {},
            namedChunkGroups: {}
          };

          const { localizationStats: statsOptions } = this._options;

          for (const untypedChunk of compilation.chunks) {
            const chunk: ILocalizedWebpackChunk = untypedChunk;
            const { localizedFiles } = chunk;

            if (localizedFiles) {
              if (chunk.hasRuntime()) {
                // This is an entrypoint
                localizationStats.entrypoints[chunk.name] = {
                  localizedAssets: localizedFiles
                };
              } else {
                // This is a secondary chunk
                if (chunk.name) {
                  localizationStats.namedChunkGroups[chunk.name] = {
                    localizedAssets: localizedFiles
                  };
                }
              }
            }
          }

          if (statsOptions) {
            if (statsOptions.dropPath) {
              const resolvedLocalizationStatsDropPath: string = path.resolve(
                compiler.outputPath,
                statsOptions.dropPath
              );
              JsonFile.save(localizationStats, resolvedLocalizationStatsDropPath, {
                ensureFolderExists: true
              });
            }

            if (statsOptions.callback) {
              try {
                statsOptions.callback(localizationStats);
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
   *
   * @returns
   */
  public addDefaultLocFile(
    terminal: ITerminal,
    localizedResourcePath: string,
    localizedResourceData: ILocalizationFile | ILocaleFileData,
    // The webpack Module object being processed by the loader
    defaultLocaleModule: Webpack.compilation.Module
  ): IAddDefaultLocFileResult {
    const additionalLoadedFilePaths: string[] = [];
    const errors: Error[] = [];

    const locFileData: ILocaleFileData = this._convertLocalizationFileToLocData(localizedResourceData);
    this._addLocFile(this._defaultLocale, localizedResourcePath, locFileData);

    const normalizeLocalizedData: (localizedData: ILocaleFileData | string) => ILocaleFileData = (
      localizedData
    ) => {
      if (typeof localizedData === 'string') {
        additionalLoadedFilePaths.push(localizedData);
        const localizationFile: ILocalizationFile = LocFileParser.parseLocFile({
          filePath: localizedData,
          content: FileSystem.readFile(localizedData),
          terminal: terminal,
          resxNewlineNormalization: this._resxNewlineNormalization
        });

        return this._convertLocalizationFileToLocData(localizationFile);
      } else {
        return localizedData;
      }
    };

    const missingLocales: string[] = [];
    for (const [translatedLocaleName, translatedStrings] of this._resolvedTranslatedStringsFromOptions) {
      const translatedLocFileFromOptions: ILocaleFileData | string | undefined =
        translatedStrings.get(localizedResourcePath);
      if (!translatedLocFileFromOptions) {
        missingLocales.push(translatedLocaleName);
      } else {
        const translatedLocFileData: ILocaleFileData = normalizeLocalizedData(translatedLocFileFromOptions);
        this._addLocFile(translatedLocaleName, localizedResourcePath, translatedLocFileData);
      }
    }

    const { resolveMissingTranslatedStrings } = this._options.localizedData;

    if (missingLocales.length > 0 && resolveMissingTranslatedStrings) {
      let resolvedTranslatedData: IResolvedMissingTranslations | undefined = undefined;
      try {
        resolvedTranslatedData = resolveMissingTranslatedStrings(
          missingLocales,
          localizedResourcePath,
          defaultLocaleModule
        );
      } catch (e) {
        errors.push(e as Error);
      }

      if (resolvedTranslatedData) {
        for (const [resolvedLocaleName, resolvedLocaleData] of Object.entries(resolvedTranslatedData)) {
          if (resolvedLocaleData) {
            const translatedLocFileData: ILocaleFileData = normalizeLocalizedData(resolvedLocaleData);
            this._addLocFile(resolvedLocaleName, localizedResourcePath, translatedLocFileData);
          }
        }
      }
    }

    this._pseudolocalizers.forEach((pseudolocalizer: (str: string) => string, pseudolocaleName: string) => {
      const pseudolocFileData: ILocaleFileData = {};

      for (const [stringName, stringValue] of Object.entries(locFileData)) {
        pseudolocFileData[stringName] = pseudolocalizer(stringValue);
      }

      this._addLocFile(pseudolocaleName, localizedResourcePath, pseudolocFileData);
    });

    EntityMarker.markEntity(defaultLocaleModule, true);

    return { additionalLoadedFilePaths, errors };
  }

  /**
   * @internal
   */
  public getPlaceholder(localizedFileKey: string, stringName: string): IStringPlaceholder | undefined {
    const stringKey: string = `${localizedFileKey}?${stringName}`;
    return this._stringKeys.get(stringKey);
  }

  /**
   * @internal
   */
  public getDataForSerialNumber(serialNumber: string): IStringPlaceholder | undefined {
    return this._stringPlaceholderMap.get(serialNumber);
  }

  private _addLocFile(
    localeName: string,
    localizedFilePath: string,
    localizedFileData: ILocaleFileData
  ): void {
    const filesMap: Map<string, Map<string, string>> = this._resolvedLocalizedStrings.get(localeName)!;

    const stringsMap: Map<string, string> = new Map<string, string>();
    filesMap.set(localizedFilePath, stringsMap);

    for (const [stringName, stringValue] of Object.entries(localizedFileData)) {
      const stringKey: string = `${localizedFilePath}?${stringName}`;
      let placeholder: IStringPlaceholder | undefined = this._stringKeys.get(stringKey);
      if (!placeholder) {
        const suffix: string = `${this._stringPlaceholderCounter++}`;

        const values: Map<string, string> = new Map();
        values.set(this._passthroughLocaleName, stringName);

        placeholder = {
          value: `${Constants.STRING_PLACEHOLDER_PREFIX}_\\_${Constants.STRING_PLACEHOLDER_LABEL}_${suffix}`,
          suffix,
          values,
          locFilePath: localizedFilePath,
          stringName
        };

        this._stringKeys.set(stringKey, placeholder);
        this._stringPlaceholderMap.set(suffix, placeholder);
      }

      placeholder.values.set(localeName, stringValue);

      stringsMap.set(stringName, stringValue);
    }
  }

  private _initializeAndValidateOptions(
    configuration: Webpack.Configuration,
    isWebpackDevServer: boolean
  ): { errors: Error[]; warnings: Error[] } {
    const errors: Error[] = [];
    const warnings: Error[] = [];

    function ensureValidLocaleName(localeName: string): boolean {
      const LOCALE_NAME_REGEX: RegExp = /[a-z-]/i;
      if (!localeName.match(LOCALE_NAME_REGEX)) {
        errors.push(
          new Error(`Invalid locale name: ${localeName}. Locale names may only contain letters and hyphens.`)
        );
        return false;
      } else {
        return true;
      }
    }

    // START configuration
    if (
      !configuration.output ||
      !configuration.output.filename ||
      typeof configuration.output.filename !== 'string' ||
      configuration.output.filename.indexOf(Constants.LOCALE_FILENAME_TOKEN) === -1
    ) {
      errors.push(
        new Error(
          'The configuration.output.filename property must be provided, must be a string, and must include ' +
            `the ${Constants.LOCALE_FILENAME_TOKEN} placeholder`
        )
      );
    }
    // END configuration

    // START misc options
    // eslint-disable-next-line no-lone-blocks
    {
      this._globsToIgnore = this._options.globsToIgnore;
    }
    // END misc options

    // START options.localizedData
    if (this._options.localizedData) {
      // START options.localizedData.passthroughLocale
      if (this._options.localizedData.passthroughLocale) {
        const { usePassthroughLocale, passthroughLocaleName = 'passthrough' } =
          this._options.localizedData.passthroughLocale;
        if (usePassthroughLocale) {
          this._passthroughLocaleName = passthroughLocaleName;
          this._resolvedLocalizedStrings.set(passthroughLocaleName, new Map());
        }
      }
      // END options.localizedData.passthroughLocale

      // START options.localizedData.translatedStrings
      const { translatedStrings } = this._options.localizedData;
      this._resolvedTranslatedStringsFromOptions.clear();
      if (translatedStrings) {
        for (const [localeName, locale] of Object.entries(translatedStrings)) {
          if (this._resolvedLocalizedStrings.has(localeName)) {
            errors.push(
              Error(
                `The locale "${localeName}" appears multiple times. ` +
                  'There may be multiple instances with different casing.'
              )
            );
            return { errors, warnings };
          }

          if (!ensureValidLocaleName(localeName)) {
            return { errors, warnings };
          }

          this._resolvedLocalizedStrings.set(localeName, new Map());
          const resolvedFromOptionsForLocale: Map<string, ILocaleFileData | string> = new Map();
          this._resolvedTranslatedStringsFromOptions.set(localeName, resolvedFromOptionsForLocale);

          const locFilePathsInLocale: Set<string> = new Set<string>();

          for (const [locFilePath, locFileDataFromOptions] of Object.entries(locale)) {
            const normalizedLocFilePath: string = path.resolve(configuration.context!, locFilePath);

            if (locFilePathsInLocale.has(normalizedLocFilePath)) {
              errors.push(
                new Error(
                  `The localization file path "${locFilePath}" appears multiple times in locale ${localeName}. ` +
                    'There may be multiple instances with different casing.'
                )
              );
              return { errors, warnings };
            }

            locFilePathsInLocale.add(normalizedLocFilePath);

            const normalizedLocFileDataFromOptions: string | ILocaleFileData =
              typeof locFileDataFromOptions === 'string'
                ? path.resolve(configuration.context!, locFileDataFromOptions)
                : locFileDataFromOptions;

            resolvedFromOptionsForLocale.set(normalizedLocFilePath, normalizedLocFileDataFromOptions);
          }
        }
      }
      // END options.localizedData.translatedStrings

      // START options.localizedData.defaultLocale
      if (this._options.localizedData.defaultLocale) {
        const { localeName, fillMissingTranslationStrings } = this._options.localizedData.defaultLocale;
        if (this._options.localizedData.defaultLocale.localeName) {
          if (this._resolvedLocalizedStrings.has(localeName)) {
            errors.push(new Error('The default locale is also specified in the translated strings.'));
            return { errors, warnings };
          } else if (!ensureValidLocaleName(localeName)) {
            return { errors, warnings };
          }

          this._resolvedLocalizedStrings.set(localeName, new Map());
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
        for (const [pseudolocaleName, pseudoLocaleOpts] of Object.entries(
          this._options.localizedData.pseudolocales
        )) {
          if (this._defaultLocale === pseudolocaleName) {
            errors.push(
              new Error(`A pseudolocale (${pseudolocaleName}) name is also the default locale name.`)
            );
            return { errors, warnings };
          }

          if (this._resolvedLocalizedStrings.has(pseudolocaleName)) {
            errors.push(
              new Error(
                `A pseudolocale (${pseudolocaleName}) name is also specified in the translated strings.`
              )
            );
            return { errors, warnings };
          }

          this._pseudolocalizers.set(
            pseudolocaleName,
            Pseudolocalization.getPseudolocalizer(pseudoLocaleOpts)
          );
          this._resolvedLocalizedStrings.set(pseudolocaleName, new Map<string, Map<string, string>>());
        }
      }
      // END options.localizedData.pseudoLocales

      // START options.localizedData.normalizeResxNewlines
      if (this._options.localizedData.normalizeResxNewlines) {
        switch (this._options.localizedData.normalizeResxNewlines) {
          case 'crlf': {
            this._resxNewlineNormalization = NewlineKind.CrLf;
            break;
          }

          case 'lf': {
            this._resxNewlineNormalization = NewlineKind.Lf;
            break;
          }

          default: {
            errors.push(
              new Error(
                `Unexpected value "${this._options.localizedData.normalizeResxNewlines}" for option ` +
                  '"localizedData.normalizeResxNewlines"'
              )
            );
            break;
          }
        }
      }
      // END options.localizedData.normalizeResxNewlines
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

  private _chunkHasLocalizedModules(chunk: Webpack.compilation.Chunk): boolean {
    let chunkHasAnyLocModules: boolean | undefined = EntityMarker.getMark(chunk);
    if (chunkHasAnyLocModules === undefined) {
      chunkHasAnyLocModules = false;
      for (const module of chunk.getModules()) {
        if (EntityMarker.getMark(module)) {
          chunkHasAnyLocModules = true;
          break;
        }
      }

      // If this chunk doesn't directly contain any localized resources, it still
      // needs to be localized if it's an entrypoint chunk (i.e. - it has a runtime)
      // and it loads localized async chunks.
      // In that case, the generated chunk URL generation code needs to contain
      // the locale name, unless it is a runtime javascript expression.
      if (!chunkHasAnyLocModules && chunk.hasRuntime() && !this._options.runtimeLocaleExpression) {
        for (const asyncChunk of chunk.getAllAsyncChunks()) {
          if (this._chunkHasLocalizedModules(asyncChunk)) {
            chunkHasAnyLocModules = true;
            break;
          }
        }
      }

      EntityMarker.markEntity(chunk, chunkHasAnyLocModules);
    }

    return chunkHasAnyLocModules;
  }

  private _convertLocalizationFileToLocData(locFile: ILocalizationFile | ILocaleFileData): ILocaleFileData {
    const locFileData: ILocaleFileData = {};
    for (const [stringName, locFileEntry] of Object.entries(locFile)) {
      // Accommodate the scenario in which the input file was already in its final form
      locFileData[stringName] = typeof locFileEntry === 'string' ? locFileEntry : locFileEntry.value;
    }

    return locFileData;
  }
}
