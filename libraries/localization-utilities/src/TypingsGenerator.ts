// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  StringValuesTypingsGenerator,
  type IStringValueTypings,
  type IExportAsDefaultOptions,
  type IStringValueTyping,
  type ITypingsGeneratorBaseOptions
} from '@rushstack/typings-generator';
import { FileSystem, type NewlineKind } from '@rushstack/node-core-library';

import type { IgnoreStringFunction, ILocalizationFile } from './interfaces.ts';
import { parseLocFile } from './LocFileParser.ts';

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
  /**
   * Options for configuring the default export.
   */
  exportAsDefault?: boolean | IExportAsDefaultOptions | IInferInterfaceNameExportAsDefaultOptions;

  /**
   * Normalizes the line endings in .resx files to the specified kind.
   */
  resxNewlineNormalization?: NewlineKind | undefined;

  /**
   * If specified, the generator will write trimmed .json files to the specified folders.
   * The .json files will be written to the same relative path as the source file.
   * For example, if the source file is "&lt;root&gt;/foo/bar.resx", and the output folder is "dist",
   * the trimmed .json file will be written to "dist/foo/bar.resx.json".
   */
  trimmedJsonOutputFolders?: string[] | undefined;

  /**
   * If true, .resx files will not throw errors if comments are missing.
   */
  ignoreMissingResxComments?: boolean | undefined;

  /**
   * Optionally, provide a function that will be called for each string. If the function returns `true`
   * the string will not be included.
   */
  ignoreString?: IgnoreStringFunction;

  /**
   * Processes the raw text of a comment.
   * @param comment - The original text of the comment to process
   * @param relativeFilePath - The relative file path
   * @param stringName - The name of the string that the comment is for
   * @returns The processed comment
   */
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
      trimmedJsonOutputFolders,
      exportAsDefault
    } = options;
    const inferDefaultExportInterfaceNameFromFilename: boolean | undefined =
      typeof exportAsDefault === 'object'
        ? (exportAsDefault as IInferInterfaceNameExportAsDefaultOptions).inferInterfaceNameFromFilename
        : undefined;

    const getJsonPaths: ((relativePath: string) => string[]) | undefined =
      trimmedJsonOutputFolders && trimmedJsonOutputFolders.length > 0
        ? (relativePath: string): string[] => {
            const jsonRelativePath: string =
              relativePath.endsWith('.json') || relativePath.endsWith('.resjson')
                ? relativePath
                : `${relativePath}.json`;

            const jsonPaths: string[] = [];
            for (const outputFolder of trimmedJsonOutputFolders) {
              jsonPaths.push(`${outputFolder}/${jsonRelativePath}`);
            }
            return jsonPaths;
          }
        : undefined;

    super({
      ...options,
      fileExtensions: ['.resx', '.resx.json', '.loc.json', '.resjson'],
      getAdditionalOutputFiles: getJsonPaths,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      parseAndGenerateTypings: async (
        content: string,
        filePath: string,
        relativeFilePath: string
      ): Promise<IStringValueTypings> => {
        const locFileData: ILocalizationFile = parseLocFile({
          filePath,
          content,
          terminal: this.terminal,
          resxNewlineNormalization,
          ignoreMissingResxComments,
          ignoreString
        });

        const typings: IStringValueTyping[] = [];

        const json: Record<string, string> | undefined = trimmedJsonOutputFolders ? {} : undefined;

        for (const [stringName, value] of Object.entries(locFileData)) {
          let comment: string | undefined = value.comment;
          if (processComment) {
            comment = processComment(comment, relativeFilePath, stringName);
          }

          if (json) {
            json[stringName] = value.value;
          }

          typings.push({
            exportName: stringName,
            comment
          });
        }

        if (getJsonPaths) {
          const jsonBuffer: Buffer = Buffer.from(JSON.stringify(json), 'utf8');
          for (const jsonFile of getJsonPaths(relativeFilePath)) {
            await FileSystem.writeFileAsync(jsonFile, jsonBuffer, {
              ensureFolderExists: true
            });
          }
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
