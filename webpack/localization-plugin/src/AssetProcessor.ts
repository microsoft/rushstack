// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Webpack from 'webpack';
import { CachedSource, Source, ReplaceSource } from 'webpack-sources';

import { Constants } from './utilities/Constants';
import { LocalizationPlugin, IStringPlaceholder } from './LocalizationPlugin';
import { ILocalizedWebpackChunk } from './webpackInterfaces';

interface ILocalizedReconstructionElement {
  kind: 'localized';
  values: Map<string, string>;
  start: number;
  end: number;
  stringName: string;
  escapedBackslash: string;
  locFilePath: string;
}

interface IDynamicReconstructionElement {
  kind: 'dynamic';
  valueFn: (locale: string, token: string | undefined) => string;
  start: number;
  end: number;
  escapedBackslash: string;
  token?: string;
}

type IReconstructionElement = ILocalizedReconstructionElement | IDynamicReconstructionElement;

interface IParseResult {
  issues: string[];
  reconstructionSeries: IReconstructionElement[];
}

interface ILocalizedReconstructionResult {
  result: ReplaceSource;
  issues: string[];
}

interface INonLocalizedReconstructionResult {
  result: ReplaceSource;
  issues: string[];
}

export interface IAssetPathOptions {
  chunk: Webpack.compilation.Chunk;
  contentHashType: string;
  filename: string;
  noChunkHash: boolean;
  locale: string;
}

export interface IAssetManifest {
  render: () => Source;
  filenameTemplate: string;
  pathOptions: IAssetPathOptions;
  identifier: string;
  hash: string;
}

export interface IProcessAssetOptionsBase {
  plugin: LocalizationPlugin;
  compilation: Webpack.compilation.Compilation;
  chunk: Webpack.compilation.Chunk;
  source: Source;
}

export interface IProcessNonLocalizedAssetOptions extends IProcessAssetOptionsBase {
  fileName: string;
  noStringsLocaleName: string;
}

export interface IProcessLocalizedAssetOptions extends IProcessAssetOptionsBase {
  locales: Set<string>;
  fillMissingTranslationStrings: boolean;
  defaultLocale: string;
  filenameTemplate: string;
}

export interface IAsset {
  size(): number;
  source(): string;
}

export interface IProcessAssetResult {
  filename: string;
  asset: IAsset;
}

export interface IExtendedCompilation extends Webpack.compilation.Compilation {
  getPathWithInfo(
    filenameTemplate: string,
    data: {
      chunk: Webpack.compilation.Chunk;
      contentHashType: 'javascript';
      locale: string;
    }
  ): { path: string; info: unknown };

  emitAsset(file: string, source: Source, info: unknown): void;
  updateAsset(file: string, source: Source, info: unknown): void;
}

export const PLACEHOLDER_REGEX: RegExp = new RegExp(
  `${Constants.STRING_PLACEHOLDER_PREFIX}_(\\\\*)_([A-C])_(\\d+)`,
  'g'
);

export class AssetProcessor {
  public static processLocalizedAsset(options: IProcessLocalizedAssetOptions): void {
    const { compilation, source, chunk, filenameTemplate, locales } = options;

    const rawSource: CachedSource = new CachedSource(source);
    const assetSource: string = rawSource.source().toString();

    const parsedAsset: IParseResult = AssetProcessor._parseStringToReconstructionSequence(
      options.plugin,
      assetSource,
      (locale: string) => JSON.stringify(locale)
    );

    const issues: string[] = parsedAsset.issues;

    const localizedFiles: Record<string, string> = {};
    (chunk as ILocalizedWebpackChunk).localizedFiles = localizedFiles;

    const existingFiles: Set<string> = new Set(chunk.files);
    for (const locale of locales) {
      const { issues: localeIssues, result: localeResult } = AssetProcessor._reconstructLocalized(
        rawSource,
        parsedAsset.reconstructionSeries,
        locale,
        options.fillMissingTranslationStrings,
        options.defaultLocale
      );

      const { path: fileName, info } = (compilation as IExtendedCompilation).getPathWithInfo(
        filenameTemplate,
        {
          chunk,
          contentHashType: 'javascript',
          // The locale property will get processed by the extension to the getAssetPath hook
          locale
        }
      );

      for (const issue of localeIssues) {
        localeIssues.push(issue);
      }

      const wrapped: CachedSource = new CachedSource(localeResult);
      localizedFiles[locale] = fileName;
      if (existingFiles.has(fileName)) {
        (compilation as IExtendedCompilation).updateAsset(fileName, wrapped, info);
      } else {
        (compilation as IExtendedCompilation).emitAsset(fileName, wrapped, info);
        compilation.additionalChunkAssets.push(fileName);
      }
    }

    if (issues.length > 0) {
      compilation.errors.push(Error(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`));
    }
  }

  public static processNonLocalizedAsset(options: IProcessNonLocalizedAssetOptions): void {
    const { source, fileName, compilation } = options;

    const rawSource: CachedSource = new CachedSource(source);
    const assetSource: string = rawSource.source().toString();

    const parsedAsset: IParseResult = AssetProcessor._parseStringToReconstructionSequence(
      options.plugin,
      assetSource,
      (locale: string) => JSON.stringify(locale)
    );

    const { issues } = parsedAsset;

    const locale: string = options.noStringsLocaleName;
    const { issues: localeIssues, result } = AssetProcessor._reconstructNonLocalized(
      rawSource,
      parsedAsset.reconstructionSeries,
      locale
    );

    for (const issue of localeIssues) {
      issues.push(issue);
    }

    const wrapped: CachedSource = new CachedSource(result);
    (compilation as IExtendedCompilation).updateAsset(fileName, wrapped, {});

    if (issues.length > 0) {
      options.compilation.errors.push(
        Error(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
      );
    }
  }

  private static _reconstructLocalized(
    originalSource: Source,
    reconstructionSeries: IReconstructionElement[],
    locale: string,
    fillMissingTranslationStrings: boolean,
    defaultLocale: string
  ): ILocalizedReconstructionResult {
    const result: ReplaceSource = new ReplaceSource(originalSource, locale);

    const issues: string[] = [];

    for (const element of reconstructionSeries) {
      switch (element.kind) {
        case 'localized': {
          let newValue: string | undefined = element.values.get(locale);
          if (!newValue) {
            if (fillMissingTranslationStrings) {
              newValue = element.values.get(defaultLocale)!;
            } else {
              issues.push(
                `The string "${element.stringName}" in "${element.locFilePath}" is missing in ` +
                  `the locale ${locale}`
              );

              newValue = '-- MISSING STRING --';
            }
          }

          const escapedBackslash: string = element.escapedBackslash || '\\';

          // Replace backslashes with the properly escaped backslash
          newValue = newValue.replace(/\\/g, escapedBackslash);

          // @todo: look into using JSON.parse(...) to get the escaping characters
          const escapingCharacterSequence: string = escapedBackslash.slice(escapedBackslash.length / 2);

          // Ensure the the quotemark, apostrophe, tab, and newline characters are properly escaped
          newValue = newValue.replace(/\r/g, `${escapingCharacterSequence}r`);
          newValue = newValue.replace(/\n/g, `${escapingCharacterSequence}n`);
          newValue = newValue.replace(/\t/g, `${escapingCharacterSequence}t`);
          newValue = newValue.replace(/\"/g, `${escapingCharacterSequence}u0022`);
          newValue = newValue.replace(/\'/g, `${escapingCharacterSequence}u0027`);

          result.replace(element.start, element.end - 1, newValue);
          break;
        }

        case 'dynamic': {
          const newValue: string = element.valueFn(locale, element.token);
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

  private static _reconstructNonLocalized(
    originalSource: Source,
    reconstructionSeries: IReconstructionElement[],
    noStringsLocaleName: string
  ): INonLocalizedReconstructionResult {
    const issues: string[] = [];

    const result: ReplaceSource = new ReplaceSource(originalSource);

    for (const element of reconstructionSeries) {
      switch (element.kind) {
        case 'localized': {
          issues.push(
            `The string "${element.stringName}" in "${element.locFilePath}" appeared in an asset ` +
              'that is not expected to contain localized resources.'
          );

          const newValue: string = '-- NOT EXPECTED TO BE LOCALIZED --';
          result.replace(element.start, element.end - 1, newValue);
          break;
        }

        case 'dynamic': {
          const newValue: string = element.valueFn(noStringsLocaleName, element.token);
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

  private static _parseStringToReconstructionSequence(
    plugin: LocalizationPlugin,
    source: string,
    jsonpFunction: (locale: string) => string
  ): IParseResult {
    const issues: string[] = [];
    const reconstructionSeries: IReconstructionElement[] = [];

    let regexResult: RegExpExecArray | null;
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
              values: stringData.values,
              locFilePath: stringData.locFilePath,
              escapedBackslash: escapedBackslash,
              stringName: stringData.stringName
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
            valueFn: (locale: string) => locale,
            escapedBackslash: escapedBackslash
          };
          localizedReconstructionElement = dynamicElement;
          break;
        }

        case Constants.JSONP_PLACEHOLDER_LABEL: {
          const dynamicElement: IDynamicReconstructionElement = {
            kind: 'dynamic',
            start,
            end,
            valueFn: jsonpFunction,
            escapedBackslash: escapedBackslash
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
}
