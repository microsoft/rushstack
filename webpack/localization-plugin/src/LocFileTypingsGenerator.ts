// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  StringValuesTypingsGenerator,
  IStringValueTyping
} from '@rushstack/typings-generator';
import { Terminal } from '@microsoft/node-core-library';

import { ILocalizationFile } from './interfaces';
import { ILoggerOptions } from './utilities/Logging';
import { LocFileParser } from './utilities/LocFileParser';

/**
 * @public
 */
export interface ITypingsGeneratorOptions {
  srcFolder: string;
  generatedTsFolder: string;
  terminal?: Terminal;
  exportAsDefault?: boolean;
  filesToIgnore?: string[];
}

/**
 * This is a simple tool that generates .d.ts files for .loc.json and .resx files.
 *
 * @public
 */
export class LocFileTypingsGenerator extends StringValuesTypingsGenerator {
  private _loggingOptions: ILoggerOptions;

  public constructor(options: ITypingsGeneratorOptions) {
    super({
      ...options,
      fileExtensions: ['resx', 'loc.json'],
      parseAndGenerateTypings: (fileContents: string, filePath: string) => {
        const locFileData: ILocalizationFile = LocFileParser.parseLocFile({
          filePath: filePath,
          content: fileContents,
          loggerOptions: this._loggingOptions
        });

        const typings: IStringValueTyping[] = [];

        for (const stringName in locFileData) { // eslint-disable-line guard-for-in
          typings.push({
            exportName: stringName,
            comment: locFileData[stringName].comment
          });
        }

        return { typings };
      }
    });

    this._loggingOptions = {
      writeError: this._options.terminal!.writeErrorLine.bind(this._options.terminal),
      writeWarning: this._options.terminal!.writeWarningLine.bind(this._options.terminal)
    };
  }
}