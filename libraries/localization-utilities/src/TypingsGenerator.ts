// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  StringValuesTypingsGenerator,
  type IStringValueTyping,
  type ITypingsGeneratorBaseOptions
} from '@rushstack/typings-generator';
import type { NewlineKind } from '@rushstack/node-core-library';

import type { IgnoreStringFunction, ILocalizationFile } from './interfaces';
import { parseLocFile } from './LocFileParser';

/**
 * @public
 */
export interface ITypingsGeneratorOptions extends ITypingsGeneratorBaseOptions {
  /**
   * Setting this option wraps the typings export in a default property.
   */
  exportAsDefault?: boolean;

  /**
   * When `exportAsDefault` is true, this value is placed in a documentation comment for the
   * exported default interface. Ignored when `exportAsDefault` is false.
   */
  exportAsDefaultDocumentationComment?: string;

  /**
   * When `exportAsDefault` is true and this option is true, the default export interface name will be inferred
   * from the filename.
   */
  inferDefaultExportInterfaceNameFromFilename?: boolean;

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
    const {
      ignoreString,
      processComment,
      terminal,
      resxNewlineNormalization,
      ignoreMissingResxComments,
      inferDefaultExportInterfaceNameFromFilename
    } = options;
    super({
      ...options,
      fileExtensions: ['.resx', '.resx.json', '.loc.json', '.resjson'],
      parseAndGenerateTypings: (fileContents: string, filePath: string, resxFilePath: string) => {
        const locFileData: ILocalizationFile = parseLocFile({
          filePath,
          content: fileContents,
          terminal: terminal!,
          resxNewlineNormalization,
          ignoreMissingResxComments,
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

        let exportAsDefaultInterfaceName: string | undefined;
        if (inferDefaultExportInterfaceNameFromFilename) {
          const lastSlashIndex: number = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
          const extensionIndex: number = Math.max(
            filePath.lastIndexOf('.resx'),
            filePath.lastIndexOf('.resjson'),
            filePath.lastIndexOf('.loc.json')
          );
          const fileNameWithoutExtension: string = filePath.substring(lastSlashIndex + 1, extensionIndex);
          const normalizedFileName: string = fileNameWithoutExtension.replace(/[^a-zA-Z0-9]/g, '');
          const [firstCharacter, ...restOfCharacters] = normalizedFileName;
          exportAsDefaultInterfaceName = `I${firstCharacter.toUpperCase()}${restOfCharacters.join('')}`;

          if (
            !exportAsDefaultInterfaceName.endsWith('strings') &&
            !exportAsDefaultInterfaceName.endsWith('Strings')
          ) {
            exportAsDefaultInterfaceName += 'Strings';
          }
        }

        return {
          typings,
          exportAsDefaultInterfaceName
        };
      }
    });
  }
}
