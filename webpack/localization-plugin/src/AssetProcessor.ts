// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Webpack from 'webpack';
import * as lodash from 'lodash';

import { Constants } from './utilities/Constants';
import { LocalizationPlugin, IStringPlaceholder } from './LocalizationPlugin';

interface IStaticReconstructionElement {
  kind: 'static';
  staticString: string;
}

interface ILocalizedReconstructionElement {
  kind: 'localized';
  values: Map<string, string>;
  size: number;
  stringName: string;
  escapedBackslash: string;
  locFilePath: string;
}

interface IDynamicReconstructionElement {
  kind: 'dynamic';
  valueFn: (locale: string, token: string | undefined) => string;
  size: number;
  escapedBackslash: string;
  token?: string;
}

type IReconstructionElement =
  | IStaticReconstructionElement
  | ILocalizedReconstructionElement
  | IDynamicReconstructionElement;

interface IParseResult {
  issues: string[];
  reconstructionSeries: IReconstructionElement[];
}

interface IReconstructedString {
  source: string;
  size: number;
}

interface ILocalizedReconstructionResult {
  result: Map<string, IReconstructedString>;
  issues: string[];
}

interface INonLocalizedReconstructionResult {
  result: IReconstructedString;
  issues: string[];
}

export interface IProcessAssetOptionsBase {
  plugin: LocalizationPlugin;
  compilation: Webpack.compilation.Compilation;
  assetName: string;
  asset: IAsset;
  chunk: Webpack.compilation.Chunk;
  noStringsLocaleName: string;
  chunkHasLocalizedModules: (chunk: Webpack.compilation.Chunk) => boolean;
}

export interface IProcessNonLocalizedAssetOptions extends IProcessAssetOptionsBase {}

export interface IProcessLocalizedAssetOptions extends IProcessAssetOptionsBase {
  locales: Set<string>;
  fillMissingTranslationStrings: boolean;
  defaultLocale: string;
}

export interface IAsset {
  size(): number;
  source(): string;
}

export interface IProcessAssetResult {
  filename: string;
  asset: IAsset;
}

export const PLACEHOLDER_REGEX: RegExp = new RegExp(
  `${Constants.STRING_PLACEHOLDER_PREFIX}_(\\\\*)_([A-C])(\\+[^+]+\\+)?_(\\d+)`,
  'g'
);

export class AssetProcessor {
  public static processLocalizedAsset(
    options: IProcessLocalizedAssetOptions
  ): Map<string, IProcessAssetResult> {
    const assetSource: string = options.asset.source();

    const parsedAsset: IParseResult = AssetProcessor._parseStringToReconstructionSequence(
      options.plugin,
      assetSource,
      this._getJsonpFunction(options.chunk, options.chunkHasLocalizedModules, options.noStringsLocaleName)
    );
    const reconstructedAsset: ILocalizedReconstructionResult = AssetProcessor._reconstructLocalized(
      parsedAsset.reconstructionSeries,
      options.locales,
      options.fillMissingTranslationStrings,
      options.defaultLocale,
      options.asset.size()
    );

    const parsedAssetName: IParseResult = AssetProcessor._parseStringToReconstructionSequence(
      options.plugin,
      options.assetName,
      () => {
        throw new Error('unsupported');
      }
    );
    const reconstructedAssetName: ILocalizedReconstructionResult = AssetProcessor._reconstructLocalized(
      parsedAssetName.reconstructionSeries,
      options.locales,
      options.fillMissingTranslationStrings,
      options.defaultLocale,
      options.assetName.length
    );

    const result: Map<string, IProcessAssetResult> = new Map<string, IProcessAssetResult>();
    for (const [locale, { source, size }] of reconstructedAsset.result) {
      const newAsset: IAsset = lodash.clone(options.asset);
      newAsset.source = () => source;
      newAsset.size = () => size;

      result.set(locale, {
        filename: reconstructedAssetName.result.get(locale)!.source,
        asset: newAsset
      });
    }

    const issues: string[] = [
      ...parsedAsset.issues,
      ...reconstructedAsset.issues,
      ...parsedAssetName.issues,
      ...reconstructedAssetName.issues
    ];

    if (issues.length > 0) {
      options.compilation.errors.push(
        Error(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
      );
    }

    return result;
  }

  public static processNonLocalizedAsset(options: IProcessNonLocalizedAssetOptions): IProcessAssetResult {
    const assetSource: string = options.asset.source();

    const parsedAsset: IParseResult = AssetProcessor._parseStringToReconstructionSequence(
      options.plugin,
      assetSource,
      this._getJsonpFunction(options.chunk, options.chunkHasLocalizedModules, options.noStringsLocaleName)
    );
    const reconstructedAsset: INonLocalizedReconstructionResult = AssetProcessor._reconstructNonLocalized(
      parsedAsset.reconstructionSeries,
      options.asset.size(),
      options.noStringsLocaleName
    );

    const parsedAssetName: IParseResult = AssetProcessor._parseStringToReconstructionSequence(
      options.plugin,
      options.assetName,
      () => {
        throw new Error('unsupported');
      }
    );
    const reconstructedAssetName: INonLocalizedReconstructionResult = AssetProcessor._reconstructNonLocalized(
      parsedAssetName.reconstructionSeries,
      options.assetName.length,
      options.noStringsLocaleName
    );

    const issues: string[] = [
      ...parsedAsset.issues,
      ...reconstructedAsset.issues,
      ...parsedAssetName.issues,
      ...reconstructedAssetName.issues
    ];

    if (issues.length > 0) {
      options.compilation.errors.push(
        Error(`localization:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
      );
    }

    const newAsset: IAsset = lodash.clone(options.asset);
    newAsset.source = () => reconstructedAsset.result.source;
    newAsset.size = () => reconstructedAsset.result.size;
    return {
      filename: reconstructedAssetName.result.source,
      asset: newAsset
    };
  }

  private static _reconstructLocalized(
    reconstructionSeries: IReconstructionElement[],
    locales: Set<string>,
    fillMissingTranslationStrings: boolean,
    defaultLocale: string,
    initialSize: number
  ): ILocalizedReconstructionResult {
    const localizedResults: Map<string, IReconstructedString> = new Map<string, IReconstructedString>();
    const issues: string[] = [];
    const reconstruction: string[] = [];

    const elementCount: number = reconstructionSeries.length;

    for (const locale of locales) {
      let size: number = initialSize;
      // Using index iteration to reuse the reconstruction array across locales
      for (let i: number = 0; i < elementCount; i++) {
        const element: IReconstructionElement = reconstructionSeries[i];
        switch (element.kind) {
          case 'static': {
            reconstruction[i] = element.staticString;
            break;
          }

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
            newValue = newValue.replace(/\"/g, `${escapingCharacterSequence}x22`);
            newValue = newValue.replace(/\'/g, `${escapingCharacterSequence}x27`);

            reconstruction[i] = newValue;
            size += newValue.length - element.size;
            break;
          }

          case 'dynamic': {
            const newValue: string = element.valueFn(locale, element.token);
            reconstruction[i] = newValue;
            size += newValue.length - element.size;
            break;
          }
        }
      }

      const source: string = reconstruction.join('');
      localizedResults.set(locale, {
        source,
        size
      });
    }

    return {
      issues,
      result: localizedResults
    };
  }

  private static _reconstructNonLocalized(
    reconstructionSeries: IReconstructionElement[],
    initialSize: number,
    noStringsLocaleName: string
  ): INonLocalizedReconstructionResult {
    const issues: string[] = [];

    const reconstruction: string[] = [];

    let size: number = initialSize;
    for (const element of reconstructionSeries) {
      switch (element.kind) {
        case 'static': {
          reconstruction.push(element.staticString);
          break;
        }

        case 'localized': {
          issues.push(
            `The string "${element.stringName}" in "${element.locFilePath}" appeared in an asset ` +
              'that is not expected to contain localized resources.'
          );

          const newValue: string = '-- NOT EXPECTED TO BE LOCALIZED --';
          reconstruction.push(newValue);
          size += newValue.length - element.size;
          break;
        }

        case 'dynamic': {
          const newValue: string = element.valueFn(noStringsLocaleName, element.token);
          reconstruction.push(newValue);
          size += newValue.length - element.size;
          break;
        }
      }
    }

    const source: string = reconstruction.join('');
    return {
      issues,
      result: {
        source,
        size
      }
    };
  }

  private static _parseStringToReconstructionSequence(
    plugin: LocalizationPlugin,
    source: string,
    jsonpFunction: (locale: string, chunkIdToken: string | undefined) => string
  ): IParseResult {
    const issues: string[] = [];
    const reconstructionSeries: IReconstructionElement[] = [];

    let lastIndex: number = 0;
    let regexResult: RegExpExecArray | null;
    while ((regexResult = PLACEHOLDER_REGEX.exec(source))) {
      // eslint-disable-line no-cond-assign
      const staticElement: IStaticReconstructionElement = {
        kind: 'static',
        staticString: source.slice(lastIndex, regexResult.index)
      };
      reconstructionSeries.push(staticElement);

      const [placeholder, escapedBackslash, elementLabel, token, placeholderSerialNumber] = regexResult;

      let localizedReconstructionElement: IReconstructionElement;
      switch (elementLabel) {
        case Constants.STRING_PLACEHOLDER_LABEL: {
          const stringData: IStringPlaceholder | undefined =
            plugin.getDataForSerialNumber(placeholderSerialNumber);
          if (!stringData) {
            issues.push(`Missing placeholder ${placeholder}`);
            const brokenLocalizedElement: IStaticReconstructionElement = {
              kind: 'static',
              staticString: placeholder
            };
            localizedReconstructionElement = brokenLocalizedElement;
          } else {
            const localizedElement: ILocalizedReconstructionElement = {
              kind: 'localized',
              values: stringData.values,
              size: placeholder.length,
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
            valueFn: (locale: string) => locale,
            size: placeholder.length,
            escapedBackslash: escapedBackslash
          };
          localizedReconstructionElement = dynamicElement;
          break;
        }

        case Constants.JSONP_PLACEHOLDER_LABEL: {
          const dynamicElement: IDynamicReconstructionElement = {
            kind: 'dynamic',
            valueFn: jsonpFunction,
            size: placeholder.length,
            escapedBackslash: escapedBackslash,
            token: token.substring(1, token.length - 1)
          };
          localizedReconstructionElement = dynamicElement;
          break;
        }

        default: {
          throw new Error(`Unexpected label ${elementLabel}`);
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

    return {
      issues,
      reconstructionSeries
    };
  }

  private static _getJsonpFunction(
    chunk: Webpack.compilation.Chunk,
    chunkHasLocalizedModules: (chunk: Webpack.compilation.Chunk) => boolean,
    noStringsLocaleName: string
  ): (locale: string, chunkIdToken: string | undefined) => string {
    const idsWithStrings: Set<number | string> = new Set<number | string>();
    const idsWithoutStrings: Set<number | string> = new Set<number | string>();

    const asyncChunks: Set<Webpack.compilation.Chunk> = chunk.getAllAsyncChunks();
    for (const asyncChunk of asyncChunks) {
      const chunkId: number | string | null = asyncChunk.id;

      if (chunkId === null || chunkId === undefined) {
        throw new Error(`Chunk "${asyncChunk.name}"'s ID is null or undefined.`);
      }

      if (chunkHasLocalizedModules(asyncChunk)) {
        idsWithStrings.add(chunkId);
      } else {
        idsWithoutStrings.add(chunkId);
      }
    }

    if (idsWithStrings.size === 0) {
      return () => JSON.stringify(noStringsLocaleName);
    } else if (idsWithoutStrings.size === 0) {
      return (locale: string) => JSON.stringify(locale);
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
      const smallerSet: Set<number | string> = isLocalizedSmaller ? idsWithStrings : idsWithoutStrings;
      for (const id of smallerSet) {
        chunkMapping[id] = 1;
      }

      return (locale: string, chunkIdToken: string | undefined) => {
        if (!locale) {
          throw new Error('Missing locale name.');
        }

        const tokenIfInSet: string = JSON.stringify(isLocalizedSmaller ? locale : noStringsLocaleName);
        const tokenIfNotInSet: string = JSON.stringify(isLocalizedSmaller ? noStringsLocaleName : locale);

        return `(${JSON.stringify(chunkMapping)}[${chunkIdToken}]?${tokenIfInSet}:${tokenIfNotInSet})`;
      };
    }
  }
}
