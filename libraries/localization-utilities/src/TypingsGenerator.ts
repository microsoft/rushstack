// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  StringValuesTypingsGenerator,
  IStringValueTyping,
  ITypingsGeneratorBaseOptions
} from '@rushstack/typings-generator';
import { NewlineKind } from '@rushstack/node-core-library';

import type { IgnoreStringFunction, ILocalizationFile } from './interfaces';
import { parseLocFile } from './LocFileParser';

/**
 * @public
 */
export interface ITypingsGeneratorOptions extends ITypingsGeneratorBaseOptions {
  exportAsDefault?: boolean;
  resxNewlineNormalization?: NewlineKind | undefined;
  ignoreMissingResxComments?: boolean | undefined;
  ignoreString?: IgnoreStringFunction;
  processComment?: (
    comment: string | undefined,
    resxFilePath: string,
    stringName: string
  ) => string | undefined;
}

/**
 * This is a simple tool that generates .d.ts files for .loc.json, .resx.json, .resjson, and .resx files.
 *
 * @public
 */
export class TypingsGenerator extends StringValuesTypingsGenerator {
  public constructor(options: ITypingsGeneratorOptions) {
    const { ignoreString, processComment } = options;
    super({
      ...options,
      fileExtensions: ['.resx', '.resx.json', '.loc.json', '.resjson'],
      parseAndGenerateTypings: (fileContents: string, filePath: string, resxFilePath: string) => {
        const locFileData: ILocalizationFile = parseLocFile({
          filePath: filePath,
          content: fileContents,
          terminal: this._options.terminal!,
          resxNewlineNormalization: options.resxNewlineNormalization,
          ignoreMissingResxComments: options.ignoreMissingResxComments,
          ignoreString
        });

        const typings: IStringValueTyping[] = [];

        // eslint-disable-next-line guard-for-in
        for (const stringName in locFileData) {
          let comment: string | undefined = locFileData[stringName].comment;
          if (processComment) {
            comment = processComment(comment, resxFilePath, stringName);
          }

          typings.push({
            exportName: stringName,
            comment
          });
        }

        return { typings };
      }
    });
  }
}
