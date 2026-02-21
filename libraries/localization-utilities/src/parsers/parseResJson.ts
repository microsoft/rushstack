// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';

import type { ILocalizationFile, IParseFileOptions } from '../interfaces.ts';

/**
 * @public
 */
export function parseResJson({ content, ignoreString, filePath }: IParseFileOptions): ILocalizationFile {
  const resjsonFile: Record<string, string> = JsonFile.parseString(content);
  const parsedFile: ILocalizationFile = {};

  const usedComments: Map<string, boolean> = new Map();
  for (const [key, value] of Object.entries(resjsonFile)) {
    if (key.startsWith('_') && key.endsWith('.comment')) {
      if (!usedComments.has(key)) {
        usedComments.set(key, false);
      }
    } else {
      const commentKey: string = `_${key}.comment`;
      const comment: string | undefined = resjsonFile[commentKey];
      usedComments.set(commentKey, true);

      if (!ignoreString?.(filePath, key)) {
        parsedFile[key] = { value, comment };
      }
    }
  }

  const orphanComments: string[] = [];
  for (const [key, used] of usedComments) {
    if (!used) {
      orphanComments.push(key.slice(1, -'.comment'.length));
    }
  }

  if (orphanComments.length > 0) {
    throw new Error(
      'The resjson file is invalid. Comments exist for the following string keys ' +
        `that don't have values: ${orphanComments.join(', ')}.`
    );
  }

  return parsedFile;
}
