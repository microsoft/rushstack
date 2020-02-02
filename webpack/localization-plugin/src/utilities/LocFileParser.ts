// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as jju from 'jju';

import {
  Logging,
  ILoggerOptions
} from './Logging';
import { ILocFile } from '../interfaces';
import { ResxReader } from './ResxReader';
import { Constants } from './Constants';

export interface IParseLocFileOptions {
  loggerOptions: ILoggerOptions;
  filePath: string;
  content: string;
}

export class LocFileParser {
  public static parseLocFile(options: IParseLocFileOptions): ILocFile {
    if (/\.resx$/i.test(options.filePath)) {
      return ResxReader.readResxAsLocFile(
        options.content,
        {
          ...Logging.getLoggingFunctions(options.loggerOptions),
          resxFilePath: options.filePath
        }
      );
    } else {
      const locJsonFileData: ILocFile = jju.parse(options.content);
      try {
        Constants.LOC_JSON_SCHEMA.validateObject(locJsonFileData, options.filePath);
      } catch (e) {
        options.loggerOptions.writeError(`The loc file is invalid. Error: ${e}`);
      }

      return locJsonFileData;
    }
  }
}
