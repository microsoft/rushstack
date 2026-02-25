// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IgnoreStringFunction, ILocalizationFile, IParseFileOptions } from './interfaces.ts';
import { parseLocJson } from './parsers/parseLocJson.ts';
import { parseResJson } from './parsers/parseResJson.ts';
import { type IParseResxOptionsBase, parseResx } from './parsers/parseResx.ts';

/**
 * @public
 */
export type ParserKind = 'resx' | 'loc.json' | 'resjson';

/**
 * @public
 */
export interface IParseLocFileOptions extends IParseFileOptions, IParseResxOptionsBase {
  parser?: ParserKind;
}

interface IParseCacheEntry {
  content: string;
  parsedFile: ILocalizationFile;
  ignoreString: IgnoreStringFunction | undefined;
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

  const fileCacheKey: string = `${options.filePath}?${parser}&${options.resxNewlineNormalization || 'none'}`;
  const parseCacheEntry: IParseCacheEntry | undefined = parseCache.get(fileCacheKey);
  if (parseCacheEntry) {
    if (
      parseCacheEntry.content === options.content &&
      parseCacheEntry.ignoreString === options.ignoreString
    ) {
      return parseCacheEntry.parsedFile;
    }
  }

  let parsedFile: ILocalizationFile;
  switch (parser) {
    case 'resx': {
      parsedFile = parseResx(options);
      break;
    }

    case 'loc.json': {
      parsedFile = parseLocJson(options);
      break;
    }

    case 'resjson': {
      parsedFile = parseResJson(options);
      break;
    }

    default: {
      throw new Error(`Unsupported parser: ${parser}`);
    }
  }

  parseCache.set(fileCacheKey, {
    content: options.content,
    parsedFile,
    ignoreString: options.ignoreString
  });

  return parsedFile;
}
