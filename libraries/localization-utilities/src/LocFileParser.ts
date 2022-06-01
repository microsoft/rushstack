// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal, NewlineKind, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import { ILocalizationFile } from './interfaces';
import { readResxAsLocFile } from './ResxReader';

const LOC_JSON_SCHEMA: JsonSchema = JsonSchema.fromFile(`${__dirname}/schemas/locJson.schema.json`);

/**
 * @public
 */
export interface IParseLocFileOptions {
  terminal: ITerminal;
  filePath: string;
  content: string;
  resxNewlineNormalization: NewlineKind | undefined;
  ignoreMissingResxComments: boolean | undefined;
}

interface IParseCacheEntry {
  content: string;
  parsedFile: ILocalizationFile;
}

const parseCache: Map<string, IParseCacheEntry> = new Map<string, IParseCacheEntry>();

  /**
   * @public
   */
  export function parseLocFile(options: IParseLocFileOptions): ILocalizationFile {
    const fileCacheKey: string = `${options.filePath}?${options.resxNewlineNormalization || 'none'}`;
    if (parseCache.has(fileCacheKey)) {
      const entry: IParseCacheEntry = parseCache.get(fileCacheKey)!;
      if (entry.content === options.content) {
        return entry.parsedFile;
      }
    }

    let parsedFile: ILocalizationFile;
    if (/\.resx$/i.test(options.filePath)) {
      parsedFile = readResxAsLocFile(options.content, {
        terminal: options.terminal,
        resxFilePath: options.filePath,
        newlineNormalization: options.resxNewlineNormalization,
        warnOnMissingComment: !options.ignoreMissingResxComments
      });
    } else if (/\.(resx|loc)\.json$/i.test(options.filePath)) {
      parsedFile = JsonFile.parseString(options.content);
      try {
        LOC_JSON_SCHEMA.validateObject(parsedFile, options.filePath);
      } catch (e) {
        options.terminal.writeError(`The loc file is invalid. Error: ${e}`);
      }
    } else if (/\.resjson$/i.test(options.filePath)) {
      const resjsonFile: Record<string, string> = JsonFile.parseString(options.content);
      parsedFile = {};
      const comments: Record<string, string> = {};
      for (const [key, value] of Object.entries(resjsonFile)) {
        if (key.startsWith('_') && key.endsWith('.comment')) {
          const commentKey: string = key.substring(1, key.length - '.comment'.length);
          comments[commentKey] = value;
        } else {
          parsedFile[key] = { value };
        }
      }

      const orphanComments: string[] = [];
      for (const [key, comment] of Object.entries(comments)) {
        if (parsedFile[key]) {
          parsedFile[key].comment = comment;
        } else {
          orphanComments.push(key);
        }
      }

      if (orphanComments.length > 0) {
        options.terminal.writeErrorLine(
          'The resjson file is invalid. Comments exist for the following string keys ' +
            `that don't have values: ${orphanComments.join(', ')}.`
        );
      }
    } else {
      throw new Error(`Unsupported file extension in file: ${options.filePath}`);
    }

    parseCache.set(fileCacheKey, { content: options.content, parsedFile });
    return parsedFile;
  }
