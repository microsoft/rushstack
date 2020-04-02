// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as jju from 'jju';
import { Terminal } from '@rushstack/node-core-library';

import { ILocalizationFile } from '../interfaces';
import { ResxReader } from './ResxReader';
import { Constants } from './Constants';

/**
 * @internal
 */
export interface IParseLocFileOptions {
  terminal: Terminal;
  filePath: string;
  content: string;
}

interface IParseCacheEntry {
  content: string;
  parsedFile: ILocalizationFile;
}

const parseCache: Map<string, IParseCacheEntry> = new Map<string, IParseCacheEntry>();

/**
 * @internal
 */
export class LocFileParser {
  public static parseLocFile(options: IParseLocFileOptions): ILocalizationFile {
    if (parseCache.has(options.filePath)) {
      const entry: IParseCacheEntry = parseCache.get(options.filePath)!;
      if (entry.content === options.content) {
        return entry.parsedFile;
      }
    }

    let parsedFile: ILocalizationFile;
    if (/\.resx$/i.test(options.filePath)) {
      parsedFile = ResxReader.readResxAsLocFile(
        options.content,
        {
          terminal: options.terminal,
          resxFilePath: options.filePath
        }
      );
    } else {
      parsedFile = jju.parse(options.content);
      try {
        Constants.LOC_JSON_SCHEMA.validateObject(parsedFile, options.filePath);
      } catch (e) {
        options.terminal.writeError(`The loc file is invalid. Error: ${e}`);
      }
    }

    parseCache.set(options.filePath, { content: options.content, parsedFile });
    return parsedFile;
  }
}
