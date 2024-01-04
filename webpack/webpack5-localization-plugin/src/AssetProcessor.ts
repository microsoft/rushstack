// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Asset, AssetInfo, Chunk, Compilation, sources } from 'webpack';

import * as Constants from './utilities/Constants';
import type { LocalizationPlugin, IStringPlaceholder } from './LocalizationPlugin';
import type { ILocalizedWebpackChunk, IAssetPathOptions } from './webpackInterfaces';

interface ILocalizedReconstructionElement {
  kind: 'localized';
  start: number;
  end: number;
  escapedBackslash: string;
  data: IStringPlaceholder;
}

interface IDynamicReconstructionElement {
  kind: 'dynamic';
  start: number;
  end: number;
  escapedBackslash: string;
  valueFn: (locale: string) => string;
}

type IReconstructionElement = ILocalizedReconstructionElement | IDynamicReconstructionElement;
type FormatLocaleForFilenameFn = (locale: string) => string;

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
  chunk: Chunk;
  asset: Asset;
}

export interface IProcessNonLocalizedAssetOptions extends IProcessAssetOptionsBase {
  fileName: string;
  noStringsLocaleName: string;
  formatLocaleForFilenameFn: FormatLocaleForFilenameFn;
}

export interface IProcessLocalizedAssetOptions extends IProcessAssetOptionsBase {
  locales: Set<string>;
  fillMissingTranslationStrings: boolean;
  defaultLocale: string;
  filenameTemplate: Parameters<typeof Compilation.prototype.getAssetPath>[0];
  formatLocaleForFilenameFn: FormatLocaleForFilenameFn;
}

export interface IProcessAssetResult {
  filename: string;
  asset: sources.Source;
}

export const PLACEHOLDER_REGEX: RegExp = new RegExp(
  `${Constants.STRING_PLACEHOLDER_PREFIX}_(\\\\*)_([A-C])_([0-9a-f]+)`,
  'g'
);

export function processLocalizedAsset(options: IProcessLocalizedAssetOptions): Record<string, string> {
  const { compilation, asset, chunk, filenameTemplate, locales, formatLocaleForFilenameFn } = options;

  const { sources, WebpackError } = compilation.compiler.webpack;

  const rawSource: sources.CachedSource = new sources.CachedSource(asset.source);
  const assetSource: string = rawSource.source().toString();

  const parsedAsset: IParseResult = _parseStringToReconstructionSequence(
    options.plugin,
    assetSource,
    formatLocaleForFilenameFn
  );

  const { issues } = parsedAsset;

  const localizedFiles: Record<string, string> = {};
  (chunk as ILocalizedWebpackChunk).localizedFiles = localizedFiles;

  const { info: originInfo, name: originName } = asset;
  if (!originInfo.related) {
    originInfo.related = {};
  }

  for (const locale of locales) {
    const { issues: localeIssues, result: localeResult } = _reconstructLocalized(
      new sources.ReplaceSource(rawSource, locale),
      parsedAsset.reconstructionSeries,
      locale,
      options.fillMissingTranslationStrings ? options.defaultLocale : undefined
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

    originInfo.related[locale] = fileName;

    const info: AssetInfo = {
      ...originInfo,
      locale
    };

    const wrapped: sources.CachedSource = new sources.CachedSource(localeResult);
    localizedFiles[locale] = fileName;

    // If file already exists
    if (originName === fileName) {
      // This helper throws if the asset doesn't already exist
      compilation.updateAsset(fileName, wrapped, info);
    } else {
      // This helper throws if the asset already exists
      compilation.emitAsset(fileName, wrapped, info);
    }
  }

  if (issues.length > 0) {
    compilation.errors.push(
      new WebpackError(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
    );
  }

  return localizedFiles;
}

export function processNonLocalizedAsset(options: IProcessNonLocalizedAssetOptions): void {
  const { asset, fileName, compilation, formatLocaleForFilenameFn } = options;

  const { sources, WebpackError } = compilation.compiler.webpack;

  const rawSource: sources.CachedSource = new sources.CachedSource(asset.source);
  const assetSource: string = rawSource.source().toString();

  const parsedAsset: IParseResult = _parseStringToReconstructionSequence(
    options.plugin,
    assetSource,
    formatLocaleForFilenameFn
  );

  const { info: originInfo } = asset;
  const { issues } = parsedAsset;

  const locale: string = options.noStringsLocaleName;
  const { issues: localeIssues, result } = _reconstructNonLocalized(
    new sources.ReplaceSource(rawSource, locale),
    parsedAsset.reconstructionSeries,
    locale
  );

  for (const issue of localeIssues) {
    issues.push(issue);
  }

  const info: AssetInfo = {
    ...originInfo,
    locale
  };

  const wrapped: sources.CachedSource = new sources.CachedSource(result);
  compilation.updateAsset(fileName, wrapped, info);

  if (issues.length > 0) {
    options.compilation.errors.push(
      new WebpackError(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
    );
  }
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
  fallbackLocale: string | undefined
): ILocalizedReconstructionResult {
  const issues: string[] = [];

  for (const element of reconstructionSeries) {
    switch (element.kind) {
      case 'localized': {
        const { data } = element;
        let newValue: string | undefined = data.valuesByLocale.get(locale);
        if (newValue === undefined) {
          if (fallbackLocale) {
            newValue = data.valuesByLocale.get(fallbackLocale)!;
          } else {
            issues.push(
              `The string "${data.stringName}" in "${data.locFilePath}" is missing in ` +
                `the locale ${locale}`
            );

            newValue = '-- MISSING STRING --';
          }
        }

        const escapedBackslash: string = element.escapedBackslash || '\\';

        // Replace backslashes with the properly escaped backslash
        BACKSLASH_REGEX.lastIndex = -1;
        newValue = newValue.replace(BACKSLASH_REGEX, escapedBackslash);

        // @todo: look into using JSON.parse(...) to get the escaping characters
        const escapingCharacterSequence: string = escapedBackslash.slice(escapedBackslash.length / 2);

        // Ensure the the quotemark, apostrophe, tab, and newline characters are properly escaped
        ESCAPE_REGEX.lastIndex = -1;
        newValue = newValue.replace(
          ESCAPE_REGEX,
          (match) => `${escapingCharacterSequence}${ESCAPE_MAP.get(match)}`
        );

        result.replace(element.start, element.end - 1, newValue);
        break;
      }

      case 'dynamic': {
        const newValue: string = element.valueFn(locale);
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

function _reconstructNonLocalized(
  result: sources.ReplaceSource,
  reconstructionSeries: IReconstructionElement[],
  noStringsLocaleName: string
): INonLocalizedReconstructionResult {
  const issues: string[] = [];

  for (const element of reconstructionSeries) {
    switch (element.kind) {
      case 'localized': {
        issues.push(
          `The string "${element.data.stringName}" in "${element.data.locFilePath}" appeared in an asset ` +
            'that is not expected to contain localized resources.'
        );

        const newValue: string = '-- NOT EXPECTED TO BE LOCALIZED --';
        result.replace(element.start, element.end - 1, newValue);
        break;
      }

      case 'dynamic': {
        const newValue: string = element.valueFn(noStringsLocaleName);
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

  const jsonStringifyFormatLocaleForFilenameFn: FormatLocaleForFilenameFn = (locale: string) =>
    JSON.stringify(formatLocaleForFilenameFn(locale));

  let regexResult: RegExpExecArray | null;
  PLACEHOLDER_REGEX.lastIndex = -1;
  while ((regexResult = PLACEHOLDER_REGEX.exec(source))) {
    const [placeholder, escapedBackslash, elementLabel, placeholderSerialNumber] = regexResult;
    const start: number = regexResult.index;
    const end: number = start + placeholder.length;

    let localizedReconstructionElement: IReconstructionElement;
    switch (elementLabel) {
      case Constants.STRING_PLACEHOLDER_LABEL: {
        const stringData: IStringPlaceholder | undefined =
          plugin.getDataForSerialNumber(placeholderSerialNumber);
        if (!stringData) {
          issues.push(`Missing placeholder ${placeholder}`);
          continue;
        } else {
          const localizedElement: ILocalizedReconstructionElement = {
            kind: 'localized',
            start,
            end,
            escapedBackslash,
            data: stringData
          };
          localizedReconstructionElement = localizedElement;
        }
        break;
      }

      case Constants.LOCALE_NAME_PLACEHOLDER_LABEL: {
        const dynamicElement: IDynamicReconstructionElement = {
          kind: 'dynamic',
          start,
          end,
          escapedBackslash,
          valueFn: formatLocaleForFilenameFn
        };
        localizedReconstructionElement = dynamicElement;
        break;
      }

      case Constants.JSONP_PLACEHOLDER_LABEL: {
        const dynamicElement: IDynamicReconstructionElement = {
          kind: 'dynamic',
          start,
          end,
          escapedBackslash,
          valueFn: jsonStringifyFormatLocaleForFilenameFn
        };
        localizedReconstructionElement = dynamicElement;
        break;
      }

      default: {
        throw new Error(`Unexpected label ${elementLabel}`);
      }
    }

    reconstructionSeries.push(localizedReconstructionElement);
  }

  return {
    issues,
    reconstructionSeries
  };
}
