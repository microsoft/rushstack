// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const OPTIONS_ARGUMENT_NAME: string = 'options';

export interface IGenerateCacheEntryIdOptions {
  projectName: string;
  projectStateHash: string;
}

export type GetCacheEntryIdFunction = (options: IGenerateCacheEntryIdOptions) => string;

const HASH_TOKEN_NAME: string = 'hash';
const PROJECT_NAME_TOKEN_NAME: string = 'projectName';

export class CacheEntryId {
  private constructor() {}

  public static parsePattern(pattern?: string): GetCacheEntryIdFunction {
    if (!pattern) {
      return ({ projectStateHash }) => projectStateHash;
    } else {
      pattern = pattern.trim();

      if (pattern.startsWith('/')) {
        throw new Error('Cache entry name patterns may not start with a slash.');
      }

      const parts: string[] = [];

      let lastCharacterWasEscape: boolean = false;
      let inToken: boolean = false;
      let buffer: string = '';
      let foundHashToken: boolean = false;

      function insertBufferAsStaticPart(): void {
        if (buffer !== '') {
          if (buffer.match(/^[A-z0-9-_\/]*$/)) {
            parts.push(buffer);
            buffer = '';
          } else {
            throw new Error(
              'Cache entry name pattern contains an invalid character. ' +
                'Only alphanumeric characters, slashes, underscores, and hyphens are allowed.'
            );
          }
        }
      }

      for (let i: number = 0; i < pattern.length; i++) {
        const char: string = pattern[i];

        if (lastCharacterWasEscape) {
          buffer += char;
          lastCharacterWasEscape = false;
        } else if (char === '\\') {
          lastCharacterWasEscape = true;
        } else if (char === '[' && !lastCharacterWasEscape) {
          if (inToken) {
            throw new Error(`Unexpected "[" character in cache entry name pattern at index ${i}.`);
          } else {
            insertBufferAsStaticPart();
            inToken = true;
          }
        } else if (char === ']' && !lastCharacterWasEscape) {
          if (!inToken) {
            throw new Error(`Unexpected "]" character in cache entry name pattern at index ${i}.`);
          } else {
            let tokenName: string;
            let tokenAttribute: string | undefined;
            const tokenSplitIndex: number = buffer.indexOf(':');
            if (tokenSplitIndex === -1) {
              tokenName = buffer;
            } else {
              tokenName = buffer.substr(0, tokenSplitIndex);
              tokenAttribute = buffer.substr(tokenSplitIndex + 1);
            }

            inToken = false;
            buffer = '';

            switch (tokenName) {
              case HASH_TOKEN_NAME: {
                if (tokenAttribute !== undefined) {
                  throw new Error(`An attribute isn\'t supported for the "${tokenName}" token.`);
                }

                foundHashToken = true;
                parts.push(`\${${OPTIONS_ARGUMENT_NAME}.projectStateHash}`);
                break;
              }

              case PROJECT_NAME_TOKEN_NAME: {
                switch (tokenAttribute) {
                  case undefined: {
                    parts.push(`\${${OPTIONS_ARGUMENT_NAME}.projectName}`);
                    break;
                  }

                  case 'normalize': {
                    parts.push(
                      `\${${OPTIONS_ARGUMENT_NAME}.projectName.replace(/\\+/g, '++').replace(/\\/\/g, '+')}`
                    );
                    break;
                  }

                  default: {
                    throw new Error(`Unexpected attribute "${tokenAttribute}" for the "${tokenName}" token.`);
                  }
                }

                break;
              }

              default: {
                throw new Error(`Unexpected token name "${tokenName}".`);
              }
            }
          }
        } else {
          buffer += char;
        }
      }

      if (inToken) {
        throw new Error('Unclosed token in cache entry name pattern.');
      } else if (lastCharacterWasEscape) {
        throw new Error('Incomplete escape sequence in cache entry name pattern.');
      } else {
        insertBufferAsStaticPart();
      }

      if (!foundHashToken) {
        throw new Error(`Cache entry name pattern is missing a [${HASH_TOKEN_NAME}] token.`);
      }

      // eslint-disable-next-line no-new-func
      return new Function(
        OPTIONS_ARGUMENT_NAME,
        `"use strict"\nreturn \`${parts.join('')}\`;`
      ) as GetCacheEntryIdFunction;
    }
  }
}
