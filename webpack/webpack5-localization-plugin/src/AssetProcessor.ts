// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Asset, AssetInfo, Chunk, Compilation, sources } from 'webpack';

import * as Constants from './utilities/Constants';
import type {
  LocalizationPlugin,
  IStringPlaceholder,
  ValueForLocaleFn,
  ICustomDataPlaceholder
} from './LocalizationPlugin';
import type { ILocalizedWebpackChunk, IAssetPathOptions } from './webpackInterfaces';

const LOCALIZED_RECONSTRUCTION_ELEMENT_KIND: 1 = 1;
const DYNAMIC_RECONSTRUCTION_ELEMENT_KIND: 2 = 2;

interface ILocalizedReconstructionElement {
  kind: typeof LOCALIZED_RECONSTRUCTION_ELEMENT_KIND;
  start: number;
  end: number;
  escapedBackslash: string;
  data: IStringPlaceholder;
}

interface IDynamicReconstructionElement {
  kind: typeof DYNAMIC_RECONSTRUCTION_ELEMENT_KIND;
  start: number;
  end: number;
  valueFn: ValueForLocaleFn;
}

type IReconstructionElement = ILocalizedReconstructionElement | IDynamicReconstructionElement;
/**
 * @remarks
 * Include the `chunk` parameter so that the functions arity is the same as the
 * `ValueForLocaleFn` type.
 */
type FormatLocaleForFilenameFn = (locale: string, chunk: unknown) => string;

interface IParseResult {
  issues: string[];
  reconstructionSeries: IReconstructionElement[];
}

interface ILocalizedReconstructionResult {
  result: sources.ReplaceSource;
  issues: string[];
}

interface INonLocalizedReconstructionResult {
  result: sources.ReplaceSource;
  issues: string[];
}

export interface IProcessAssetOptionsBase {
  plugin: LocalizationPlugin;
  compilation: Compilation;
  cache: ReturnType<Compilation['getCache']>;
  chunk: Chunk;
  asset: Asset;
}

export interface IProcessNonLocalizedAssetOptions extends IProcessAssetOptionsBase {
  fileName: string;
  hasUrlGenerator: boolean;
  noStringsLocaleName: string;
  formatLocaleForFilenameFn: FormatLocaleForFilenameFn;
}

export interface IProcessLocalizedAssetOptions extends IProcessAssetOptionsBase {
  locales: Set<string>;
  fillMissingTranslationStrings: boolean;
  defaultLocale: string;
  passthroughLocaleName: string | undefined;
  filenameTemplate: Parameters<typeof Compilation.prototype.getAssetPath>[0];
  formatLocaleForFilenameFn: FormatLocaleForFilenameFn;
}

interface IProcessedAsset {
  filename: string;
  source: sources.CachedSource;
  info: AssetInfo;
}

interface IProcessLocalizedAssetResult {
  localizedFiles: Record<string, string>;
  processedAssets: IProcessedAsset[];
}

type ItemCacheFacade = ReturnType<ReturnType<Compilation['getCache']>['getItemCache']>;

export async function processLocalizedAssetCachedAsync(
  options: IProcessLocalizedAssetOptions
): Promise<Record<string, string>> {
  const { compilation, asset, cache, chunk } = options;
  const { source: originalSource } = asset;

  type ETag = NonNullable<ReturnType<typeof cache.getLazyHashedEtag>>;
  const eTag: ETag | null = cache.getLazyHashedEtag(originalSource);
  const { name: originName } = asset;
  const cacheItem: ItemCacheFacade = cache.getItemCache(originName, eTag);
  let output: IProcessLocalizedAssetResult | undefined = await cacheItem.getPromise();

  if (!output) {
    output = processLocalizedAsset(options);
    await cacheItem.storePromise(output);
  }

  const { localizedFiles, processedAssets } = output;

  (chunk as ILocalizedWebpackChunk).localizedFiles = localizedFiles;

  for (const { filename, source, info } of processedAssets) {
    if (originName === filename) {
      // This helper throws if the asset doesn't already exist
      // Use the function form so that the object identity of `related` is preserved.
      // Since we already read the original info, we don't need fancy merge logic.
      compilation.updateAsset(filename, source, () => info);
    } else {
      // This helper throws if the asset already exists
      compilation.emitAsset(filename, source, info);
    }
  }

  return localizedFiles;
}

export function processLocalizedAsset(options: IProcessLocalizedAssetOptions): IProcessLocalizedAssetResult {
  const {
    compilation,
    asset,
    chunk,
    filenameTemplate,
    locales,
    formatLocaleForFilenameFn,
    plugin,
    fillMissingTranslationStrings,
    defaultLocale,
    passthroughLocaleName
  } = options;
  const { sources, WebpackError } = compilation.compiler.webpack;
  const { source: originalSource } = asset;

  const fallbackLocale: string | undefined = fillMissingTranslationStrings ? defaultLocale : undefined;
  const rawSource: sources.CachedSource =
    originalSource instanceof sources.CachedSource
      ? originalSource
      : new sources.CachedSource(originalSource);
  const assetSource: string = rawSource.source().toString();

  const parsedAsset: IParseResult = _parseStringToReconstructionSequence(
    plugin,
    assetSource,
    formatLocaleForFilenameFn
  );

  const { issues } = parsedAsset;

  const localizedFiles: Record<string, string> = {};

  const processedAssets: IProcessedAsset[] = [];

  const { info: originInfo, name: originName } = asset;
  if (!originInfo.related) {
    originInfo.related = {};
  }

  for (const locale of locales) {
    const { issues: localeIssues, result: localeResult } = _reconstructLocalized(
      new sources.ReplaceSource(rawSource, locale),
      parsedAsset.reconstructionSeries,
      locale,
      fallbackLocale,
      passthroughLocaleName,
      chunk
    );

    for (const issue of localeIssues) {
      issues.push(issue);
    }

    const data: IAssetPathOptions = {
      chunk,
      contentHashType: 'javascript',
      // The locale property will get processed by the extension to the getAssetPath hook
      locale
    };

    const fileName: string = compilation.getAssetPath(filenameTemplate, data);

    const info: AssetInfo & { locale: string } = {
      ...originInfo,
      locale
    };

    const wrapped: sources.CachedSource = new sources.CachedSource(localeResult);
    localizedFiles[locale] = fileName;

    processedAssets.push({
      filename: fileName,
      source: wrapped,
      info
    });

    // If file already exists
    if (originName !== fileName) {
      // If A.related points to B, B.related can't point to A or the stats emitter explodes
      // So just strip the related object for the localized assets
      info.related = undefined;
      // We omit the `related` property that does a self-reference.
      originInfo.related[locale] = fileName;
    }
  }

  if (issues.length > 0) {
    compilation.errors.push(
      new WebpackError(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
    );
  }

  return {
    localizedFiles,
    processedAssets
  };
}

export async function processNonLocalizedAssetCachedAsync(
  options: IProcessNonLocalizedAssetOptions
): Promise<void> {
  const { compilation, asset, cache } = options;
  const { source: originalSource } = asset;

  type ETag = NonNullable<ReturnType<typeof cache.getLazyHashedEtag>>;
  const eTag: ETag | null = cache.getLazyHashedEtag(originalSource);
  const { name: originName } = asset;
  const cacheItem: ItemCacheFacade = cache.getItemCache(originName, eTag);
  let output: IProcessedAsset | undefined = await cacheItem.getPromise();

  if (!output) {
    output = processNonLocalizedAsset(options);
    await cacheItem.storePromise(output);
  }

  const { filename, source, info } = output;
  compilation.updateAsset(originName, source, info);
  if (originName !== filename) {
    compilation.renameAsset(originName, filename);
  }
}

export function processNonLocalizedAsset(options: IProcessNonLocalizedAssetOptions): IProcessedAsset {
  const { asset, fileName, compilation, formatLocaleForFilenameFn, hasUrlGenerator, chunk } = options;

  const { sources, WebpackError } = compilation.compiler.webpack;

  const rawSource: sources.Source = asset.source;
  let cachedSource: sources.CachedSource =
    rawSource instanceof sources.CachedSource ? rawSource : new sources.CachedSource(rawSource);

  const { info: originInfo } = asset;
  const locale: string = options.noStringsLocaleName;

  if (hasUrlGenerator) {
    const assetSource: string = cachedSource.source().toString();
    const parsedAsset: IParseResult = _parseStringToReconstructionSequence(
      options.plugin,
      assetSource,
      formatLocaleForFilenameFn
    );

    const { issues } = parsedAsset;

    const { issues: localeIssues, result } = _reconstructNonLocalized(
      new sources.ReplaceSource(cachedSource, locale),
      parsedAsset.reconstructionSeries,
      locale,
      chunk
    );

    for (const issue of localeIssues) {
      issues.push(issue);
    }

    if (issues.length > 0) {
      options.compilation.errors.push(
        new WebpackError(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
      );
    }

    cachedSource = new sources.CachedSource(result);
  } else {
    // Force the CachedSource to cache the concatenated *string*, so that the subsequent ask for the buffer is fast
    cachedSource.source();
  }

  const info: AssetInfo = {
    ...originInfo,
    locale
  };

  return {
    filename: fileName,
    source: cachedSource,
    info
  };
}

const ESCAPE_MAP: Map<string, string> = new Map([
  ['\r', 'r'],
  ['\n', 'n'],
  ['\t', 't'],
  ['"', 'u0022'],
  ["'", 'u0027']
]);

const BACKSLASH_REGEX: RegExp = /\\/g;
const ESCAPE_REGEX: RegExp = /[\r\n\t"']/g;

function _reconstructLocalized(
  result: sources.ReplaceSource,
  reconstructionSeries: IReconstructionElement[],
  locale: string,
  fallbackLocale: string | undefined,
  passthroughLocale: string | undefined,
  chunk: Chunk
): ILocalizedReconstructionResult {
  const issues: string[] = [];

  for (const element of reconstructionSeries) {
    const { kind, start, end } = element;
    switch (kind) {
      case LOCALIZED_RECONSTRUCTION_ELEMENT_KIND: {
        const { data, escapedBackslash } = element;
        const { stringName, translations } = data;
        let newValue: string | undefined =
          locale === passthroughLocale ? stringName : translations.get(locale)?.get(stringName);
        if (fallbackLocale && newValue === undefined) {
          newValue = translations.get(fallbackLocale)?.get(stringName);
        }

        if (newValue === undefined) {
          issues.push(
            `The string "${stringName}" in "${data.locFilePath}" is missing in the locale ${locale}`
          );

          newValue = '-- MISSING STRING --';
        }

        if (newValue.includes('\\')) {
          // The vast majority of localized strings do not contain `\\`, so this check avoids an allocation.
          // Replace backslashes with the properly escaped backslash
          BACKSLASH_REGEX.lastIndex = -1;
          newValue = newValue.replace(BACKSLASH_REGEX, escapedBackslash);
        }

        // Ensure the the quotemark, apostrophe, tab, and newline characters are properly escaped
        ESCAPE_REGEX.lastIndex = -1;
        if (ESCAPE_REGEX.test(newValue)) {
          // The majority of localized strings do not contain the characters that need to be escaped,
          // so this check avoids an allocation.
          // @todo: look into using JSON.parse(...) to get the escaping characters
          const escapingCharacterSequence: string = escapedBackslash.slice(escapedBackslash.length / 2);
          newValue = newValue.replace(
            ESCAPE_REGEX,
            (match) => `${escapingCharacterSequence}${ESCAPE_MAP.get(match)}`
          );
        }

        result.replace(start, end - 1, newValue);
        break;
      }

      case DYNAMIC_RECONSTRUCTION_ELEMENT_KIND: {
        const newValue: string = element.valueFn(locale, chunk);
        result.replace(start, end - 1, newValue);
        break;
      }
    }
  }

  return {
    issues,
    result
  };
}

function _reconstructNonLocalized(
  result: sources.ReplaceSource,
  reconstructionSeries: IReconstructionElement[],
  noStringsLocaleName: string,
  chunk: Chunk
): INonLocalizedReconstructionResult {
  const issues: string[] = [];

  for (const element of reconstructionSeries) {
    switch (element.kind) {
      case LOCALIZED_RECONSTRUCTION_ELEMENT_KIND: {
        issues.push(
          `The string "${element.data.stringName}" in "${element.data.locFilePath}" appeared in an asset ` +
            'that is not expected to contain localized resources.'
        );

        const newValue: string = '-- NOT EXPECTED TO BE LOCALIZED --';
        result.replace(element.start, element.end - 1, newValue);
        break;
      }

      case DYNAMIC_RECONSTRUCTION_ELEMENT_KIND: {
        const newValue: string = element.valueFn(noStringsLocaleName, chunk);
        result.replace(element.start, element.end - 1, newValue);
        break;
      }
    }
  }

  return {
    issues,
    result
  };
}

function _parseStringToReconstructionSequence(
  plugin: LocalizationPlugin,
  source: string,
  formatLocaleForFilenameFn: FormatLocaleForFilenameFn
): IParseResult {
  const issues: string[] = [];
  const reconstructionSeries: IReconstructionElement[] = [];

  let jsonStringifyFormatLocaleForFilenameFn: FormatLocaleForFilenameFn | undefined;

  let index: number = source.indexOf(Constants.STRING_PLACEHOLDER_PREFIX);
  const increment: number = Constants.STRING_PLACEHOLDER_PREFIX.length + 1;
  while (index >= 0) {
    const start: number = index;
    const elementStart: number = index + increment;
    const elementLabel: string = source.charAt(elementStart);
    let end: number = elementStart + 2;

    switch (elementLabel) {
      case Constants.STRING_PLACEHOLDER_LABEL: {
        const backslashEnd: number = source.indexOf('_', end);
        const escapedBackslash: string = source.slice(end, backslashEnd) || '\\';
        end = backslashEnd + 1;
        const suffixEnd: number = source.indexOf('_', end);
        const suffix: string = source.slice(end, suffixEnd);
        end = suffixEnd + 1;

        const stringData: IStringPlaceholder | undefined = plugin._getStringDataForSerialNumber(suffix);
        if (!stringData) {
          issues.push(`Missing placeholder ${suffix}`);
        } else {
          const localizedElement: ILocalizedReconstructionElement = {
            kind: LOCALIZED_RECONSTRUCTION_ELEMENT_KIND,
            start,
            end,
            escapedBackslash,
            data: stringData
          };
          reconstructionSeries.push(localizedElement);
        }
        break;
      }

      case Constants.LOCALE_NAME_PLACEHOLDER_LABEL: {
        const dynamicElement: IDynamicReconstructionElement = {
          kind: DYNAMIC_RECONSTRUCTION_ELEMENT_KIND,
          start,
          end,
          valueFn: formatLocaleForFilenameFn
        };
        reconstructionSeries.push(dynamicElement);
        break;
      }

      case Constants.JSONP_PLACEHOLDER_LABEL: {
        jsonStringifyFormatLocaleForFilenameFn ||= (locale: string, chunk: unknown) =>
          JSON.stringify(formatLocaleForFilenameFn(locale, chunk));
        const dynamicElement: IDynamicReconstructionElement = {
          kind: DYNAMIC_RECONSTRUCTION_ELEMENT_KIND,
          start,
          end,
          valueFn: jsonStringifyFormatLocaleForFilenameFn
        };
        reconstructionSeries.push(dynamicElement);
        break;
      }

      case Constants.CUSTOM_PLACEHOLDER_LABEL: {
        const serialEnd: number = source.indexOf('_', end);
        const serial: string = source.slice(end, serialEnd);
        end = serialEnd + 1;
        const customData: ICustomDataPlaceholder | undefined = plugin._getCustomDataForSerialNumber(serial);
        if (!customData) {
          issues.push(`Missing custom placeholder ${serial}`);
        } else {
          const dynamicElement: IDynamicReconstructionElement = {
            kind: DYNAMIC_RECONSTRUCTION_ELEMENT_KIND,
            start,
            end,
            valueFn: customData.valueForLocaleFn
          };
          reconstructionSeries.push(dynamicElement);
        }
        break;
      }

      default: {
        throw new Error(`Unexpected label ${elementLabel} in pattern ${source.slice(start, end)}`);
      }
    }

    index = source.indexOf(Constants.STRING_PLACEHOLDER_PREFIX, end);
  }

  return {
    issues,
    reconstructionSeries
  };
}
