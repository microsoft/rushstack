// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal, NewlineKind } from '@rushstack/node-core-library';

import { ILocalizationFile } from './interfaces';
import { parseLocJson } from './parsers/parseLocJson';
import { parseResJson } from './parsers/parseResJson';
import { readResxAsLocFile } from './ResxReader';

/**
 * @public
 */
export type ParserKind = 'resx' | 'loc.json' | 'resjson';

/**
 * @public
 */
export interface IParseLocFileOptions {
  terminal: ITerminal;
  filePath: string;
  content: string;
  parser?: ParserKind;
  resxNewlineNormalization: NewlineKind | undefined;
  ignoreMissingResxComments: boolean | undefined;
}

interface IParseCacheEntry {
  content: string;
  parsedFile: ILocalizationFile;
}

const parseCache: Map<string, IParseCacheEntry> = new Map<string, IParseCacheEntry>();

export function selectParserByFilePath(filePath: string): ParserKind {
  if (/\.resx$/i.test(filePath)) {
    return 'resx';
  } else if (/\.(resx|loc)\.json$/i.test(filePath)) {
    return 'loc.json';
  } else if (/\.resjson$/i.test(filePath)) {
    return 'resjson';
  } else {
    throw new Error(`Unsupported file extension in file: ${filePath}`);
  }
}

/**
 * @public
 */
export function parseLocFile(options: IParseLocFileOptions): ILocalizationFile {
  const { parser = selectParserByFilePath(options.filePath) } = options;

  let parsedFile: ILocalizationFile;
  if (parser === 'resx') {
    const fileCacheKey: string = `${options.filePath}?${options.resxNewlineNormalization || 'none'}`;
    if (parseCache.has(fileCacheKey)) {
      const entry: IParseCacheEntry = parseCache.get(fileCacheKey)!;
      if (entry.content === options.content) {
        return entry.parsedFile;
      }
    }
    parsedFile = readResxAsLocFile(options.content, {
      terminal: options.terminal,
      resxFilePath: options.filePath,
      newlineNormalization: options.resxNewlineNormalization,
      warnOnMissingComment: !options.ignoreMissingResxComments
    });
    parseCache.set(fileCacheKey, { content: options.content, parsedFile });

    return parsedFile;
  } else if (parser === 'loc.json') {
    return parseLocJson(options);
  } else if (parser === 'resjson') {
    return parseResJson(options);
  } else {
    throw new Error(`Unsupported parser: ${parser}`);
  }
}
