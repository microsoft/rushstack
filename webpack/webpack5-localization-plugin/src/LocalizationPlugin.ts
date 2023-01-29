// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import type {
  Asset,
  Chunk,
  ChunkGraph,
  Compilation,
  Compiler,
  LoaderContext,
  Module,
  runtime,
  WebpackError,
  WebpackPluginInstance
} from 'webpack';

import { getPseudolocalizer, ILocalizationFile, parseResJson } from '@rushstack/localization-utilities';

import * as Constants from './utilities/Constants';
import type {
  ILocalizationPluginOptions,
  ILocalizationStats,
  ILocaleFileData,
  ILocaleFileObject,
  IResolvedMissingTranslations
} from './interfaces';
import type { IAssetPathOptions } from './webpackInterfaces';
import { markEntity, getMark } from './utilities/EntityMarker';
import { processLocalizedAsset, processNonLocalizedAsset } from './AssetProcessor';

/**
 * @public
 */
export interface IStringPlaceholder {
  /**
   * The literal string that will be injected for later replacement.
   */
  value: string;
  /**
   * The identifier for this particular placeholder, for lookup.
   */
  suffix: string;
  /**
   * The values of this string in each output locale.
   */
  valuesByLocale: Map<string, string>;
  /**
   * The key used to identify the source file containing the string.
   */
  locFilePath: string;
  /**
   * The identifier of the string within its original source file.
   */
  stringName: string;
}

const PLUGIN_NAME: 'localization' = 'localization';

const pluginForCompiler: WeakMap<Compiler, LocalizationPlugin> = new WeakMap();

/**
 * Gets the instance of the LocalizationPlugin bound to the specified webpack compiler.
 * Used by loaders.
 */
export function getPluginInstance(compiler: Compiler | undefined): LocalizationPlugin {
  const instance: LocalizationPlugin | undefined = compiler && pluginForCompiler.get(compiler);
  if (!instance) {
    throw new Error(`Could not find a LocalizationPlugin instance for the current webpack compiler!`);
  }
  return instance;
}

/**
 * This plugin facilitates localization in webpack.
 *
 * @public
 */
export class LocalizationPlugin implements WebpackPluginInstance {
  public readonly stringKeys: Map<string, IStringPlaceholder> = new Map();

  private readonly _options: ILocalizationPluginOptions;
  private readonly _resolvedTranslatedStringsFromOptions: Map<
    string,
    Map<string, ILocaleFileObject | string | ReadonlyMap<string, string>>
  > = new Map();
  private _stringPlaceholderCounter: number = 0;
  private readonly _stringPlaceholderMap: Map<string, IStringPlaceholder> = new Map();
  private _passthroughLocaleName!: string;
  private _defaultLocale!: string;
  private _noStringsLocaleName!: string;
  private _fillMissingTranslationStrings!: boolean;
  private readonly _pseudolocalizers: Map<string, (str: string) => string> = new Map();

  /**
   * The outermost map's keys are the locale names.
   * The middle map's keys are the resolved, file names.
   * The innermost map's keys are the string identifiers and its values are the string values.
   */
  private _resolvedLocalizedStrings: Map<string, Map<string, Map<string, string>>> = new Map();

  public constructor(options: ILocalizationPluginOptions) {
    this._options = options;
  }

  /**
   * Apply this plugin to the specified webpack compiler.
   */
  public apply(compiler: Compiler): void {
    pluginForCompiler.set(compiler, this);

    // https://github.com/webpack/webpack-dev-server/pull/1929/files#diff-15fb51940da53816af13330d8ce69b4eR66
    const isWebpackDevServer: boolean = process.env.WEBPACK_DEV_SERVER === 'true';

    const { errors, warnings } = this._initializeAndValidateOptions(compiler, isWebpackDevServer);

    if (errors.length > 0 || warnings.length > 0) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
        compilation.errors.push(...errors);
        compilation.warnings.push(...warnings);
      });

      if (errors.length > 0) {
        // If there are any errors, just pass through the resources in source and don't do any
        // additional configuration
        return;
      }
    }

    const {
      WebpackError,
      runtime: { GetChunkFilenameRuntimeModule }
    } = compiler.webpack;

    // Side-channel for async chunk URL generator chunk, since the actual chunk is completely inaccessible
    // from the assetPath hook below when invoked to build the async URL generator
    let chunkWithAsyncURLGenerator: Chunk | undefined;

    const originalGenerate: typeof GetChunkFilenameRuntimeModule.prototype.generate =
      GetChunkFilenameRuntimeModule.prototype.generate;
    GetChunkFilenameRuntimeModule.prototype.generate = function (
      this: runtime.GetChunkFilenameRuntimeModule
    ) {
      // `originalGenerate` will invoke `getAssetPath` to produce the async URL generator
      // Need to know the identity of the containing chunk to correctly produce the asset path expression
      chunkWithAsyncURLGenerator = this.chunk;
      const result: string = originalGenerate.call(this);
      // Unset after the call finishes because we are no longer generating async URL generators
      chunkWithAsyncURLGenerator = undefined;
      return result;
    };

    const asyncGeneratorTest: RegExp = /^\" \+/;

    const { runtimeLocaleExpression } = this._options;

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
      compilation.hooks.assetPath.tap(
        PLUGIN_NAME,
        (assetPath: string, options: IAssetPathOptions): string => {
          const { chunkGraph } = compilation;

          if (
            options.contentHashType === 'javascript' &&
            assetPath.match(Constants.LOCALE_FILENAME_TOKEN_REGEX)
          ) {
            // Does this look like an async chunk URL generator?
            if (typeof options.chunk?.id === 'string' && options.chunk.id.match(asyncGeneratorTest)) {
              const chunkIdsWithStrings: Set<number | string> = new Set<number | string>();
              const chunkIdsWithoutStrings: Set<number | string> = new Set<number | string>();

              if (!chunkWithAsyncURLGenerator) {
                compilation.errors.push(
                  new WebpackError(`No active chunk while constructing async chunk URL generator!`)
                );
                return assetPath;
              }

              const asyncChunks: Set<Chunk> = chunkWithAsyncURLGenerator!.getAllAsyncChunks();
              for (const asyncChunk of asyncChunks) {
                const chunkId: number | string | null = asyncChunk.id;

                if (chunkId === null || chunkId === undefined) {
                  throw new Error(`Chunk "${asyncChunk.name}"'s ID is null or undefined.`);
                }

                if (_chunkHasLocalizedModules(chunkGraph, asyncChunk, runtimeLocaleExpression)) {
                  chunkIdsWithStrings.add(chunkId);
                } else {
                  chunkIdsWithoutStrings.add(chunkId);
                }
              }

              return assetPath.replace(Constants.LOCALE_FILENAME_TOKEN_REGEX, () => {
                // Use a replacer function so that we don't need to escape anything in the return value

                // If the runtime chunk is itself localized, forcibly match the locale of the runtime chunk
                // Otherwise prefer the runtime expression if specified
                const localeExpression: string =
                  (!_chunkHasLocalizedModules(
                    chunkGraph,
                    chunkWithAsyncURLGenerator!,
                    runtimeLocaleExpression
                  ) &&
                    runtimeLocaleExpression) ||
                  Constants.JSONP_PLACEHOLDER;

                if (chunkIdsWithStrings.size === 0) {
                  return this._noStringsLocaleName;
                } else if (chunkIdsWithoutStrings.size === 0) {
                  return `" + ${localeExpression} + "`;
                } else {
                  // Generate an object that is used to select between <locale> and <nostrings locale> for each chunk ID
                  // Method: pick the smaller set of (localized, non-localized) and map that to 1 (a truthy value)
                  // All other IDs map to `undefined` (a falsy value), so we then use the ternary operator to select
                  // the appropriate token
                  //
                  // This can be improved in the future. We can maybe sort the chunks such that the chunks below a certain ID
                  // number are localized and the those above are not.
                  const chunkMapping: { [chunkId: string]: 1 } = {};
                  // Use the map with the fewest values to shorten the expression
                  const isLocalizedSmaller: boolean = chunkIdsWithStrings.size <= chunkIdsWithoutStrings.size;
                  // These are the ids for which the expression should evaluate to a truthy value
                  const smallerSet: Set<number | string> = isLocalizedSmaller
                    ? chunkIdsWithStrings
                    : chunkIdsWithoutStrings;
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
              let locale: string | undefined = options.locale;
              if (!locale) {
                const isLocalized: boolean = _chunkHasLocalizedModules(
                  chunkGraph,
                  options.chunk as Chunk,
                  runtimeLocaleExpression
                );
                // Ensure that the initial name maps to a file that should exist in the final output
                locale = isLocalized ? this._defaultLocale : this._noStringsLocaleName;
              }
              return assetPath.replace(Constants.LOCALE_FILENAME_TOKEN_REGEX, locale);
            }
          } else {
            return assetPath;
          }
        }
      );

      const { outputOptions } = compilation;

      // For compatibility with minifiers, need to generate the additional assets after the optimize process runs
      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          // Generating derived assets, but explicitly want to create them *after* asset optimization
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE - 1
        },
        async (): Promise<void> => {
          const locales: Set<string> = new Set(this._resolvedLocalizedStrings.keys());

          const { chunkGraph, chunks } = compilation;

          const filesByChunkName: Map<string, Record<string, string>> = new Map();
          const localizedEntryPointNames: string[] = [];
          const localizedChunkNames: string[] = [];

          const { localizationStats: statsOptions } = this._options;

          for (const chunk of chunks) {
            const isLocalized: boolean = _chunkHasLocalizedModules(
              chunkGraph,
              chunk,
              runtimeLocaleExpression
            );

            const template: Parameters<typeof Compilation.prototype.getAssetPath>[0] =
              chunk.filenameTemplate ||
              (chunk.hasRuntime() ? outputOptions.filename : outputOptions.chunkFilename)!;

            const defaultAssetName: string = compilation.getPath(template, {
              chunk,
              contentHashType: 'javascript'
              // Without locale this should return the name of the default asset
            });

            const asset: Asset | undefined = compilation.getAsset(defaultAssetName);
            if (!asset) {
              compilation.errors.push(new WebpackError(`Missing expected chunk asset ${defaultAssetName}`));
              continue;
            }

            if (isLocalized) {
              const localizedAssets: Record<string, string> = processLocalizedAsset({
                // Global values
                plugin: this,
                compilation,
                locales,
                defaultLocale: this._defaultLocale,
                fillMissingTranslationStrings: this._fillMissingTranslationStrings,
                // Chunk-specific values
                chunk,
                asset,
                filenameTemplate: template
              });

              if (statsOptions) {
                if (chunk.name) {
                  filesByChunkName.set(chunk.name, localizedAssets);
                  (chunk.hasRuntime() ? localizedEntryPointNames : localizedChunkNames).push(chunk.name);
                }
              }
            } else {
              processNonLocalizedAsset({
                // Global values
                plugin: this,
                compilation,
                noStringsLocaleName: this._noStringsLocaleName,
                // Chunk-specific values
                chunk,
                asset,
                fileName: defaultAssetName
              });
            }
          }

          // Since the stats generation doesn't depend on content, do it immediately
          if (statsOptions) {
            const localizationStats: ILocalizationStats = {
              entrypoints: {},
              namedChunkGroups: {}
            };

            // Sort in lexicographic order to ensure stable output
            localizedChunkNames.sort();
            for (const chunkName of localizedChunkNames) {
              localizationStats.namedChunkGroups[chunkName] = {
                localizedAssets: filesByChunkName.get(chunkName)!
              };
            }

            // Sort in lexicographic order to ensure stable output
            localizedEntryPointNames.sort();
            for (const chunkName of localizedEntryPointNames) {
              localizationStats.entrypoints[chunkName] = {
                localizedAssets: filesByChunkName.get(chunkName)!
              };
            }

            const { dropPath, callback } = statsOptions;

            if (dropPath) {
              compilation.emitAsset(
                dropPath,
                new compiler.webpack.sources.RawSource(JSON.stringify(localizationStats))
              );
            }

            if (callback) {
              try {
                callback(localizationStats);
              } catch (e) {
                /* swallow errors from the callback */
              }
            }
          }
        }
      );
    });
  }

  /**
   * @public
   *
   * @returns An object mapping the string keys to placeholders
   */
  public async addDefaultLocFileAsync(
    context: LoaderContext<{}>,
    localizedFileKey: string,
    localizedResourceData: ILocalizationFile
  ): Promise<Record<string, string>> {
    const locFileData: ReadonlyMap<string, string> = convertLocalizationFileToLocData(localizedResourceData);
    const resultObject: Record<string, string> = this._addLocFileAndGetPlaceholders(
      this._defaultLocale,
      localizedFileKey,
      locFileData
    );

    const missingLocales: string[] = [];
    for (const [translatedLocaleName, translatedStrings] of this._resolvedTranslatedStringsFromOptions) {
      const translatedLocFileFromOptions: ILocaleFileData | undefined =
        translatedStrings.get(localizedFileKey);

      if (!translatedLocFileFromOptions) {
        missingLocales.push(translatedLocaleName);
      } else {
        const translatedLocFileData: ReadonlyMap<string, string> = await normalizeLocalizedData(
          context,
          translatedLocFileFromOptions
        );
        this._addTranslations(translatedLocaleName, localizedFileKey, translatedLocFileData);
      }
    }

    const { resolveMissingTranslatedStrings } = this._options.localizedData;

    if (missingLocales.length > 0 && resolveMissingTranslatedStrings) {
      let resolvedTranslatedData: IResolvedMissingTranslations | undefined = undefined;
      try {
        resolvedTranslatedData = await resolveMissingTranslatedStrings(
          missingLocales,
          localizedFileKey,
          context
        );
      } catch (e) {
        context.emitError(e);
      }

      if (resolvedTranslatedData) {
        const iterable: Iterable<[string, ILocaleFileData]> =
          resolvedTranslatedData instanceof Map
            ? resolvedTranslatedData.entries()
            : Object.entries(resolvedTranslatedData);
        for (const [resolvedLocaleName, resolvedLocaleData] of iterable) {
          if (resolvedLocaleData) {
            const translatedLocFileData: ReadonlyMap<string, string> = await normalizeLocalizedData(
              context,
              resolvedLocaleData
            );
            this._addTranslations(resolvedLocaleName, localizedFileKey, translatedLocFileData);
          }
        }
      }
    }

    for (const [pseudolocaleName, pseudolocalizer] of this._pseudolocalizers) {
      const pseudolocFileData: Map<string, string> = new Map();

      for (const [stringName, stringValue] of locFileData) {
        pseudolocFileData.set(stringName, pseudolocalizer(stringValue));
      }

      this._addTranslations(pseudolocaleName, localizedFileKey, pseudolocFileData);
    }

    markEntity(context._module!, true);

    return resultObject;
  }

  /**
   * @public
   */
  public getPlaceholder(localizedFileKey: string, stringName: string): IStringPlaceholder | undefined {
    const stringKey: string = `${localizedFileKey}?${stringName}`;
    return this.stringKeys.get(stringKey);
  }

  /**
   * @internal
   */
  public getDataForSerialNumber(serialNumber: string): IStringPlaceholder | undefined {
    return this._stringPlaceholderMap.get(serialNumber);
  }

  private _addLocFileAndGetPlaceholders(
    localeName: string,
    localizedFileKey: string,
    localizedFileData: ReadonlyMap<string, string>
  ): Record<string, string> {
    const filesMap: Map<string, ReadonlyMap<string, string>> = this._resolvedLocalizedStrings.get(
      localeName
    )!;

    filesMap.set(localizedFileKey, localizedFileData);

    const resultObject: Record<string, string> = {};
    for (const [stringName, stringValue] of localizedFileData) {
      const stringKey: string = `${localizedFileKey}?${stringName}`;
      let placeholder: IStringPlaceholder | undefined = this.stringKeys.get(stringKey);
      if (!placeholder) {
        // TODO: This may need to be a deterministic identifier to support watch / incremental compilation
        const suffix: string = `${this._stringPlaceholderCounter++}`;

        const values: Map<string, string> = new Map();
        values.set(this._passthroughLocaleName, stringName);

        placeholder = {
          value: `${Constants.STRING_PLACEHOLDER_PREFIX}_\\_${Constants.STRING_PLACEHOLDER_LABEL}_${suffix}`,
          suffix,
          valuesByLocale: values,
          locFilePath: localizedFileKey,
          stringName
        };

        this.stringKeys.set(stringKey, placeholder);
        this._stringPlaceholderMap.set(suffix, placeholder);
      }

      resultObject[stringName] = placeholder.value;

      placeholder.valuesByLocale.set(localeName, stringValue);
    }

    return resultObject;
  }

  private _addTranslations(
    localeName: string,
    localizedFileKey: string,
    localizedFileData: ReadonlyMap<string, string>
  ): void {
    for (const [stringName, stringValue] of localizedFileData) {
      const stringKey: string = `${localizedFileKey}?${stringName}`;
      const placeholder: IStringPlaceholder | undefined = this.stringKeys.get(stringKey);
      if (placeholder) {
        placeholder.valuesByLocale.set(localeName, stringValue);
      }
    }
  }

  private _initializeAndValidateOptions(
    compiler: Compiler,
    isWebpackDevServer: boolean
  ): { errors: WebpackError[]; warnings: WebpackError[] } {
    const errors: WebpackError[] = [];
    const warnings: WebpackError[] = [];

    const { WebpackError } = compiler.webpack;
    const { options: configuration } = compiler;

    const LOCALE_NAME_REGEX: RegExp = /[a-z-]/i;
    function ensureValidLocaleName(localeName: string): boolean {
      if (!localeName.match(LOCALE_NAME_REGEX)) {
        errors.push(
          new WebpackError(
            `Invalid locale name: ${localeName}. Locale names may only contain letters and hyphens.`
          )
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
        new WebpackError(
          'The configuration.output.filename property must be provided, must be a string, and must include ' +
            `the ${Constants.LOCALE_FILENAME_TOKEN} placeholder`
        )
      );
    }
    // END configuration

    // START misc options
    // START options.localizedData
    const { localizedData } = this._options;
    if (localizedData) {
      // START options.localizedData.passthroughLocale
      const { passthroughLocale } = localizedData;
      if (passthroughLocale) {
        const { usePassthroughLocale, passthroughLocaleName = 'passthrough' } = passthroughLocale;
        if (usePassthroughLocale) {
          this._passthroughLocaleName = passthroughLocaleName;
          this._resolvedLocalizedStrings.set(passthroughLocaleName, new Map());
        }
      }
      // END options.localizedData.passthroughLocale

      // START options.localizedData.translatedStrings
      const resolveRelativeToContext: (relative: string) => string = (
        configuration.context?.startsWith('/') ? path.posix.resolve : path.resolve
      ).bind(0, configuration.context!);
      const { translatedStrings } = localizedData;
      this._resolvedTranslatedStringsFromOptions.clear();
      if (translatedStrings) {
        for (const [localeName, locale] of Object.entries(translatedStrings)) {
          if (this._resolvedLocalizedStrings.has(localeName)) {
            errors.push(
              new WebpackError(
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
          const resolvedFromOptionsForLocale: Map<string, ILocaleFileData> = new Map();
          this._resolvedTranslatedStringsFromOptions.set(localeName, resolvedFromOptionsForLocale);

          for (const [locFilePath, locFileDataFromOptions] of Object.entries(locale)) {
            const normalizedLocFilePath: string = resolveRelativeToContext(locFilePath);

            if (resolvedFromOptionsForLocale.has(normalizedLocFilePath)) {
              errors.push(
                new WebpackError(
                  `The localization file path "${locFilePath}" appears multiple times in locale ${localeName}. ` +
                    'There may be multiple instances with different casing.'
                )
              );
              return { errors, warnings };
            }

            const normalizedLocFileDataFromOptions: ILocaleFileData =
              typeof locFileDataFromOptions === 'string'
                ? resolveRelativeToContext(locFileDataFromOptions)
                : locFileDataFromOptions;

            resolvedFromOptionsForLocale.set(normalizedLocFilePath, normalizedLocFileDataFromOptions);
          }
        }
      }
      // END options.localizedData.translatedStrings

      // START options.localizedData.defaultLocale
      const { defaultLocale } = localizedData;
      if (defaultLocale) {
        const { localeName, fillMissingTranslationStrings } = defaultLocale;
        if (localeName) {
          if (this._resolvedLocalizedStrings.has(localeName)) {
            errors.push(new WebpackError('The default locale is also specified in the translated strings.'));
            return { errors, warnings };
          } else if (!ensureValidLocaleName(localeName)) {
            return { errors, warnings };
          }

          this._resolvedLocalizedStrings.set(localeName, new Map());
          this._defaultLocale = localeName;
          this._fillMissingTranslationStrings = !!fillMissingTranslationStrings;
        } else {
          errors.push(new WebpackError('Missing default locale name'));
          return { errors, warnings };
        }
      } else {
        errors.push(new WebpackError('Missing default locale options.'));
        return { errors, warnings };
      }
      // END options.localizedData.defaultLocale

      // START options.localizedData.pseudoLocales
      const { pseudolocales } = localizedData;
      if (pseudolocales) {
        for (const [pseudolocaleName, pseudoLocaleOpts] of Object.entries(pseudolocales)) {
          if (this._defaultLocale === pseudolocaleName) {
            errors.push(
              new WebpackError(`A pseudolocale (${pseudolocaleName}) name is also the default locale name.`)
            );
            return { errors, warnings };
          }

          if (this._resolvedLocalizedStrings.has(pseudolocaleName)) {
            errors.push(
              new WebpackError(
                `A pseudolocale (${pseudolocaleName}) name is also specified in the translated strings.`
              )
            );
            return { errors, warnings };
          }

          this._pseudolocalizers.set(pseudolocaleName, getPseudolocalizer(pseudoLocaleOpts));
          this._resolvedLocalizedStrings.set(pseudolocaleName, new Map<string, Map<string, string>>());
        }
      }
      // END options.localizedData.pseudoLocales
    } else if (!isWebpackDevServer) {
      throw new Error('Localized data must be provided unless webpack dev server is running.');
    }
    // END options.localizedData

    // START options.noStringsLocaleName
    const { noStringsLocaleName } = this._options;
    if (
      noStringsLocaleName === undefined ||
      noStringsLocaleName === null ||
      !ensureValidLocaleName(noStringsLocaleName)
    ) {
      this._noStringsLocaleName = 'none';
    } else {
      this._noStringsLocaleName = noStringsLocaleName;
    }
    // END options.noStringsLocaleName

    return { errors, warnings };
  }
}

function _chunkHasLocalizedModules(
  chunkGraph: ChunkGraph,
  chunk: Chunk,
  runtimeLocaleExpression: string | undefined
): boolean {
  let chunkHasAnyLocModules: boolean | undefined = getMark(chunk);
  if (chunkHasAnyLocModules === undefined) {
    chunkHasAnyLocModules = false;
    const candidateModules: Iterable<Module> | undefined = chunkGraph.getChunkModulesIterableBySourceType(
      chunk,
      'javascript'
    );
    if (candidateModules) {
      outer: for (const module of candidateModules) {
        const moduleMark: boolean | undefined = getMark(module);
        if (moduleMark) {
          chunkHasAnyLocModules = true;
          break;
        } else if (moduleMark === false) {
          continue;
        }

        // Is this a concatenated module?
        const { _modules: modules } = module as { _modules?: Iterable<Module> };
        if (modules) {
          for (const nestedModule of modules) {
            if (getMark(nestedModule)) {
              markEntity(module, true);
              chunkHasAnyLocModules = true;
              break outer;
            }
          }
          markEntity(module, false);
        }
      }
    }

    // If this chunk doesn't directly contain any localized resources, it still
    // needs to be localized if it's an entrypoint chunk (i.e. - it has a runtime)
    // and it loads localized async chunks.
    // In that case, the generated chunk URL generation code needs to contain
    // the locale name.
    if (!chunkHasAnyLocModules && !runtimeLocaleExpression && chunk.hasRuntime()) {
      for (const asyncChunk of chunk.getAllAsyncChunks()) {
        if (_chunkHasLocalizedModules(chunkGraph, asyncChunk, runtimeLocaleExpression)) {
          chunkHasAnyLocModules = true;
          break;
        }
      }
    }

    markEntity(chunk, chunkHasAnyLocModules);
  }

  return chunkHasAnyLocModules;
}

function convertLocalizationFileToLocData(locFile: ILocalizationFile): ReadonlyMap<string, string> {
  const locFileData: Map<string, string> = new Map();
  for (const [stringName, locFileEntry] of Object.entries(locFile)) {
    locFileData.set(stringName, locFileEntry.value);
  }

  return locFileData;
}

async function normalizeLocalizedData(
  context: LoaderContext<{}>,
  localizedData: ILocaleFileData
): Promise<ReadonlyMap<string, string>> {
  if (typeof localizedData === 'string') {
    // The value is the path to a file. Add it as a file dependency
    context.addDependency(localizedData);
    const content: string = await new Promise((resolve, reject) => {
      // Use context.fs so that the plugin is compatible with overriding compiler.inputFileSystem
      context.fs.readFile(localizedData, (err, data) => {
        if (err) {
          return reject(err);
        } else if (!data) {
          return reject(new Error(`No data in ${localizedData}`));
        }
        resolve(data.toString());
      });
    });

    const localizationFile: ILocalizationFile = parseResJson({
      filePath: localizedData,
      content
    });

    return convertLocalizationFileToLocData(localizationFile);
  } else {
    return localizedData instanceof Map ? localizedData : new Map(Object.entries(localizedData));
  }
}
