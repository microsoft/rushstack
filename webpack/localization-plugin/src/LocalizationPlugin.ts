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
  ILocalizationFile,
  IPseudolocaleOptions,
  ILocaleElementMap
} from './interfaces';
import {
  ILocalizedWebpackChunk
} from './webpackInterfaces';
import { TypingsGenerator } from './TypingsGenerator';
import { Pseudolocalization } from './Pseudolocalization';
import { EntityMarker } from './utilities/EntityMarker';

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
  chunk: {};
  contentHashType: string;
}

interface IProcessStringResult {
  source: string;
  size: number;
}

interface IProcessStringResultSet {
  localizedResults: Map<string, IProcessStringResult>;
  issues: string[];
}

const PLUGIN_NAME: string = 'localization';

const PLACEHOLDER_PREFIX: string = Constants.STRING_PLACEHOLDER_PREFIX;
const PLACEHOLDER_REGEX: RegExp = new RegExp(
  // The maximum length of quotemark escaping we can support is the length of the placeholder prefix
  `${PLACEHOLDER_PREFIX}_((?:[^_]){1,${PLACEHOLDER_PREFIX.length}})_(\\d+)`,
  'g'
);

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
  private _stringPlaceholderMap: Map<string, ILocaleElementMap> = new Map<string, ILocaleElementMap>();
  private _locales: Set<string> = new Set<string>();
  private _passthroughLocaleName: string;
  private _defaultLocale: string;
  private _noStringsLocaleName: string;
  private _fillMissingTranslationStrings: boolean;
  private _localeNamePlaceholder: IStringPlaceholder;
  private _jsonpScriptNameLocalePlaceholder: IStringPlaceholder;
  private _placeholderToLocFilePathMap: Map<string, string> = new Map<string, string>();
  private _placeholderToStringNameMap: Map<string, string> = new Map<string, string>();
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

    const errors: Error[] = this._initializeAndValidateOptions(compiler.options, isWebpackDevServer);

    let typingsPreprocessor: TypingsGenerator | undefined;
    if (this._options.typingsOptions) {
      typingsPreprocessor = new TypingsGenerator({
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
      localeNameOrPlaceholder: this._localeNamePlaceholder.value
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
        compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: IExtendedConfiguration) => {
          (compilation.mainTemplate as unknown as IExtendedMainTemplate).hooks.assetPath.tap(
            PLUGIN_NAME,
            (assetPath: string, options: IAssetPathOptions) => {
              if (
                options.contentHashType === 'javascript' &&
                assetPath.match(Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX)
              ) {
                return assetPath.replace(
                  Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
                  `" + ${this._jsonpScriptNameLocalePlaceholder.value} + "`
                  );
              } else {
                return assetPath;
              }

              // return source.replace(Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX, this._localeNamePlaceholder.value);
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
                let chunkHasAnyLocModules: boolean = false;
                for (const module of chunk.getModules()) {
                  if (EntityMarker.getMark(module)) {
                    chunkHasAnyLocModules = true;
                    break;
                  }
                }

                const replacementValue: string = chunkHasAnyLocModules
                  ? this._localeNamePlaceholder.value
                  : this._noStringsLocaleName;
                EntityMarker.markEntity(chunk, chunkHasAnyLocModules);
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
            const localizedChunkAssets: ILocaleElementMap = {};
            let alreadyProcessedAFileInThisChunk: boolean = false;
            for (const chunkFileName of chunk.files) {
              if (
                chunkFileName.indexOf(this._localeNamePlaceholder.value) !== -1 && // Ensure this is expected to be localized
                chunkFileName.endsWith('.js') && // Ensure this is a JS file
                !alreadyProcessedAssets.has(chunkFileName) // Ensure this isn't a vendor chunk we've already processed
              ) {
                if (alreadyProcessedAFileInThisChunk) {
                  throw new Error(`Found more than one JS file in chunk "${chunk.name}". This is not expected.`);
                }

                alreadyProcessedAFileInThisChunk = true;
                alreadyProcessedAssets.add(chunkFileName);

                const asset: IAsset = compilation.assets[chunkFileName];
                const resultingAssets: Map<string, IProcessAssetResult> = this._processAsset(
                  compilation,
                  chunkFileName,
                  asset,
                  chunk
                );

                // Delete the existing asset because it's been renamed
                delete compilation.assets[chunkFileName];
                chunkFilesSet.delete(chunkFileName);

                for (const [locale, newAsset] of resultingAssets) {
                  compilation.assets[newAsset.filename] = newAsset.asset;
                  localizedChunkAssets[locale] = newAsset.filename;
                  chunkFilesSet.add(newAsset.filename);
                }
              }
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

            chunk.files = Array.from(chunkFilesSet);
            chunk.localizedFiles = localizedChunkAssets;
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
    asset: IAsset,
    chunk: Webpack.compilation.Chunk
  ): Map<string, IProcessAssetResult> {
    const assetSource: string = asset.source();

    const getJsonpFn: () => ((locale: string) => string) = () => {
      const idsWithStrings: Set<string> = new Set<string>();
      const idsWithoutStrings: Set<string> = new Set<string>();

      const asyncChunks: Set<Webpack.compilation.Chunk> = chunk.getAllAsyncChunks();
      for (const asyncChunk of asyncChunks) {
        if (EntityMarker.getMark(asyncChunk)) {
          idsWithStrings.add(asyncChunk.id);
        } else {
          idsWithoutStrings.add(asyncChunk.id);
        }
      }

      if (idsWithStrings.size === 0) {
        return () => JSON.stringify(this._noStringsLocaleName);
      } else if (idsWithoutStrings.size === 0) {
        return (locale: string) => JSON.stringify(locale);
      } else {
        // Generate an array [<locale>, <nostrings locale>] and an object that is used as an indexer into that
        // object that maps chunk IDs to 0s for chunks with localized strings and 1s for chunks without localized
        // strings
        //
        // This can be improved in the future. We can maybe sort the chunks such that the chunks below a certain ID
        // number are localized and the those above are not.
        const chunkMapping: { [chunkId: string]: number } = {};
        for (const idWithStrings of idsWithStrings) {
          chunkMapping[idWithStrings] = 0;
        }

        for (const idWithoutStrings of idsWithoutStrings) {
          chunkMapping[idWithoutStrings] = 1;
        }

        return (locale: string) => {
          return `(${JSON.stringify([locale, this._noStringsLocaleName])})[${JSON.stringify(chunkMapping)}[chunkId]]`;
        }
      }
    };

    const processedResult: IProcessStringResultSet = this._processString(
      assetSource,
      asset.size(),
      chunk.hasRuntime() ? getJsonpFn() : undefined
    );
    const filenameResult: IProcessStringResultSet = this._processString(assetName, assetName.length);

    const result: Map<string, IProcessAssetResult> = new Map<string, IProcessAssetResult>();
    for (const [locale, { source, size }] of processedResult.localizedResults) {
      const newAsset: IAsset = lodash.clone(asset);
      newAsset.source = () => source;
      newAsset.size = () => size;

      result.set(
        locale,
        {
          filename: filenameResult.localizedResults.get(locale)!.source,
          asset: newAsset
        }
      );
    }

    const issues: string[] = [
      ...processedResult.issues,
      ...filenameResult.issues
    ];

    if (issues.length > 0) {
      compilation.errors.push(Error(
        `localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`
      ));
    }

    return result;
  }

  private _processString(
    source: string,
    initialSize: number,
    jsonpFunction: ((locale: string) => string) | undefined = undefined
  ): IProcessStringResultSet {
    if (!jsonpFunction) {
      jsonpFunction = () => { throw new Error('JSONP placeholder replacement is unsupported in this context') };
    }

    interface IReconstructionElement {
      kind: 'static' | 'localized' | 'dynamic';
    }

    interface IStaticReconstructionElement extends IReconstructionElement {
      kind: 'static';
      staticString: string;
    }

    interface ILocalizedReconstructionElement extends IReconstructionElement {
      kind: 'localized';
      values: ILocaleElementMap;
      size: number;
      quotemarkCharacter: string | undefined;
      stringName: string;
      locFilePath: string;
    }

    interface IDynamicReconstructionElement extends IReconstructionElement {
      kind: 'dynamic';
      valueFn: (locale: string) => string;
      size: number;
    }

    const issues: string[] = [];
    const reconstructionSeries: IReconstructionElement[] = [];

    let lastIndex: number = 0;
    let regexResult: RegExpExecArray | null;
    while (regexResult = PLACEHOLDER_REGEX.exec(source)) { // eslint-disable-line no-cond-assign
      const staticElement: IStaticReconstructionElement = {
        kind: 'static',
        staticString: source.substring(lastIndex, regexResult.index)
      };
      reconstructionSeries.push(staticElement);

      const [placeholder, quotemark, placeholderSerialNumber] = regexResult;

      let localizedReconstructionElement: IReconstructionElement;
      if (placeholderSerialNumber === this._localeNamePlaceholder.suffix) {
        const dynamicElement: IDynamicReconstructionElement = {
          kind: 'dynamic',
          valueFn: (locale: string) => locale,
          size: placeholder.length
        };
        localizedReconstructionElement = dynamicElement;
      } else if (placeholderSerialNumber === this._jsonpScriptNameLocalePlaceholder.suffix) {
        const dynamicElement: IDynamicReconstructionElement = {
          kind: 'dynamic',
          valueFn: jsonpFunction,
          size: placeholder.length
        };
        localizedReconstructionElement = dynamicElement;
      } else {
        const values: ILocaleElementMap | undefined = this._stringPlaceholderMap.get(placeholderSerialNumber);
        if (!values) {
          issues.push(`Missing placeholder ${placeholder}`);
          const brokenLocalizedElement: IStaticReconstructionElement = {
            kind: 'static',
            staticString: placeholder
          };
          localizedReconstructionElement = brokenLocalizedElement;
        } else {
          const localizedElement: ILocalizedReconstructionElement = {
            kind: 'localized',
            values: values,
            size: placeholder.length,
            quotemarkCharacter: quotemark !== '"' ? quotemark : undefined,
            locFilePath: this._placeholderToLocFilePathMap.get(placeholderSerialNumber)!,
            stringName: this._placeholderToStringNameMap.get(placeholderSerialNumber)!,
          };
          localizedReconstructionElement = localizedElement;
        }
      }

      reconstructionSeries.push(localizedReconstructionElement);
      lastIndex = regexResult.index + placeholder.length;
    }

    const lastElement: IStaticReconstructionElement = {
      kind: 'static',
      staticString: source.substr(lastIndex)
    };
    reconstructionSeries.push(lastElement);

    const result: IProcessStringResultSet = {
      issues,
      localizedResults: new Map<string, IProcessStringResult>()
    };

    for (const locale of this._locales) {
      const reconstruction: string[] = [];

      let sizeDiff: number = 0;
      for (const element of reconstructionSeries) {
        switch (element.kind) {
          case 'static': {
            reconstruction.push((element as IStaticReconstructionElement).staticString);
            break;
          }

          case 'localized': {
            const localizedElement: ILocalizedReconstructionElement = element as ILocalizedReconstructionElement;
            let newValue: string | undefined = localizedElement.values[locale];
            if (!newValue) {
              if (this._fillMissingTranslationStrings) {
                newValue = localizedElement.values[this._defaultLocale];
              } else {
                issues.push(
                  `The string "${localizedElement.stringName}" in "${localizedElement.locFilePath}" is missing in ` +
                  `the locale ${locale}`
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
            break;
          }

          case 'dynamic': {
            const dynamicElement: IDynamicReconstructionElement = element as IDynamicReconstructionElement;
            const newValue: string = dynamicElement.valueFn(locale);
            reconstruction.push(newValue);
            sizeDiff += (newValue.length - dynamicElement.size);
            break;
          }
        }
      }

      const newAssetSource: string = reconstruction.join('');
      result.localizedResults.set(
        locale,
        {
          source: newAssetSource,
          size: initialSize + sizeDiff
        }
      );
    }

    return result;
  }

  private _initializeAndValidateOptions(configuration: Webpack.Configuration, isWebpackDevServer: boolean): Error[] {
    const errors: Error[] = [];

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
      // Create a special placeholder for the locale's name
      this._localeNamePlaceholder = this._getPlaceholderString();

      // Create a special placeholder for the [locale] token in the JSONP script src function
      this._jsonpScriptNameLocalePlaceholder = this._getPlaceholderString();

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
        for (const localeName in translatedStrings) {
          if (translatedStrings.hasOwnProperty(localeName)) {
            if (this._locales.has(localeName)) {
              errors.push(Error(
                `The locale "${localeName}" appears multiple times. ` +
                'There may be multiple instances with different casing.'
              ));
              return errors;
            }

            if (!ensureValidLocaleName(localeName)) {
              return errors;
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
            errors.push(new Error('The default locale is also specified in the translated strings.'));
            return errors;
          } else if (!ensureValidLocaleName(localeName)) {
            return errors;
          }

          this._locales.add(localeName);
          this._resolvedLocalizedStrings.set(localeName, new Map<string, Map<string, string>>());
          this._defaultLocale = localeName;
          this._fillMissingTranslationStrings = !!fillMissingTranslationStrings;
        } else {
          errors.push(new Error('Missing default locale name'));
          return errors;
        }
      } else {
        errors.push(new Error('Missing default locale options.'));
        return errors;
      }
      // END options.localizedData.defaultLocale

      // START options.localizedData.pseudoLocales
      if (this._options.localizedData.pseudolocales) {
        for (const pseudolocaleName in this._options.localizedData.pseudolocales) {
          if (this._options.localizedData.pseudolocales.hasOwnProperty(pseudolocaleName)) {
            if (this._defaultLocale === pseudolocaleName) {
              errors.push(new Error(`A pseudolocale (${pseudolocaleName}) name is also the default locale name.`));
              return errors;
            }

            if (this._locales.has(pseudolocaleName)) {
              errors.push(new Error(
                `A pseudolocale (${pseudolocaleName}) name is also specified in the translated strings.`
              ));
              return errors;
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
