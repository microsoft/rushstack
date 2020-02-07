// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as jju from 'jju';
import { loader } from 'webpack';

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

interface IParseCacheEntry {
  content: string;
  parsedFile: ILocFile;
}

const parseCache: Map<string, IParseCacheEntry> = new Map<string, IParseCacheEntry>();

export class LocFileParser {
  public static parseLocFileFromLoader(content: string, loaderContext: loader.LoaderContext): ILocFile {
    return LocFileParser.parseLocFile({
      filePath: loaderContext.resourcePath,
      loggerOptions: { writeError: loaderContext.emitError, writeWarning: loaderContext.emitWarning },
      content
    });
  }

  public static parseLocFile(options: IParseLocFileOptions): ILocFile {
    if (parseCache.has(options.filePath)) {
      const entry: IParseCacheEntry = parseCache.get(options.filePath)!;
      if (entry.content === options.content) {
        return entry.parsedFile;
      }
    }

    let parsedFile: ILocFile;
    if (/\.resx$/i.test(options.filePath)) {
      parsedFile = ResxReader.readResxAsLocFile(
        options.content,
        {
          ...Logging.getLoggingFunctions(options.loggerOptions),
          resxFilePath: options.filePath
        }
      );
    } else {
      parsedFile = jju.parse(options.content);
      try {
        Constants.LOC_JSON_SCHEMA.validateObject(parsedFile, options.filePath);
      } catch (e) {
        options.loggerOptions.writeError(`The loc file is invalid. Error: ${e}`);
      }
    }

    parseCache.set(options.filePath, { content: options.content, parsedFile });
    return parsedFile;
  }
}
