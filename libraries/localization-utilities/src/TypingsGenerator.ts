// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  StringValuesTypingsGenerator,
  type IStringValueTypings,
  type IExportAsDefaultOptions,
  type IStringValueTyping,
  type ITypingsGeneratorBaseOptions
} from '@rushstack/typings-generator';
import type { NewlineKind } from '@rushstack/node-core-library';

import type { IgnoreStringFunction, ILocalizationFile } from './interfaces';
import { parseLocFile } from './LocFileParser';

/**
 * @public
 */
export interface IInferInterfaceNameExportAsDefaultOptions
  extends Omit<IExportAsDefaultOptions, 'interfaceName'> {
  /**
   * When `exportAsDefault` is true and this option is true, the default export interface name will be inferred
   * from the filename.
   */
  inferInterfaceNameFromFilename?: boolean;
}

/**
 * @public
 */
export interface ITypingsGeneratorOptions extends ITypingsGeneratorBaseOptions {
  exportAsDefault?: boolean | IExportAsDefaultOptions | IInferInterfaceNameExportAsDefaultOptions;

  resxNewlineNormalization?: NewlineKind | undefined;

  ignoreMissingResxComments?: boolean | undefined;

  ignoreString?: IgnoreStringFunction;

  processComment?: (
    comment: string | undefined,
    relativeFilePath: string,
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
      resxNewlineNormalization,
      ignoreMissingResxComments,
      exportAsDefault
    } = options;
    const inferDefaultExportInterfaceNameFromFilename: boolean | undefined =
      typeof exportAsDefault === 'object'
        ? (exportAsDefault as IInferInterfaceNameExportAsDefaultOptions).inferInterfaceNameFromFilename
        : undefined;
    super({
      ...options,
      fileExtensions: ['.resx', '.resx.json', '.loc.json', '.resjson'],
      parseAndGenerateTypings: (
        content: string,
        filePath: string,
        relativeFilePath: string
      ): IStringValueTypings => {
        const locFileData: ILocalizationFile = parseLocFile({
          filePath,
          content,
          terminal: this.terminal,
          resxNewlineNormalization,
          ignoreMissingResxComments,
          ignoreString
        });

        const typings: IStringValueTyping[] = [];

        // eslint-disable-next-line guard-for-in
        for (const [stringName, value] of Object.entries(locFileData)) {
          let comment: string | undefined = value.comment;
          if (processComment) {
            comment = processComment(comment, relativeFilePath, stringName);
          }

          typings.push({
            exportName: stringName,
            comment
          });
        }

        if (inferDefaultExportInterfaceNameFromFilename) {
          const lastSlashIndex: number = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
          let extensionIndex: number = filePath.lastIndexOf('.');
          if (filePath.slice(extensionIndex).toLowerCase() === '.json') {
            extensionIndex = filePath.lastIndexOf('.', extensionIndex - 1);
          }

          const fileNameWithoutExtension: string = filePath.substring(lastSlashIndex + 1, extensionIndex);
          const normalizedFileName: string = fileNameWithoutExtension.replace(/[^a-zA-Z0-9$_]/g, '');
          const firstCharUpperCased: string = normalizedFileName.charAt(0).toUpperCase();
          let interfaceName: string | undefined = `I${firstCharUpperCased}${normalizedFileName.slice(1)}`;

          if (!interfaceName.endsWith('strings') && !interfaceName.endsWith('Strings')) {
            interfaceName += 'Strings';
          }

          return {
            typings,
            exportAsDefault: {
              interfaceName
            }
          };
        } else {
          return {
            typings
          };
        }
      }
    });
  }
}
