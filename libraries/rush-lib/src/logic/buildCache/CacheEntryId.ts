// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const OPTIONS_ARGUMENT_NAME: string = 'options';

/**
 * Options for generating the cache id for an operation.
 * @beta
 */
export interface IGenerateCacheEntryIdOptions {
  /**
   * The name of the project
   */
  projectName: string;
  /**
   * The name of the phase
   */
  phaseName: string;
  /**
   * A hash of the input files
   */
  projectStateHash: string;
}

/**
 * Calculates the cache entry id string for an operation.
 * @beta
 */
export type GetCacheEntryIdFunction = (options: IGenerateCacheEntryIdOptions) => string;

const HASH_TOKEN_NAME: string = 'hash';
const PROJECT_NAME_TOKEN_NAME: string = 'projectName';
const PHASE_NAME_TOKEN_NAME: string = 'phaseName';

// This regex matches substrings that look like [token]
const TOKEN_REGEX: RegExp = /\[[^\]]*\]/g;

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

      const patternWithoutTokens: string = pattern.replace(TOKEN_REGEX, '');
      if (patternWithoutTokens.match(/\]/)) {
        throw new Error(`Unexpected "]" character in cache entry name pattern.`);
      }

      if (patternWithoutTokens.match(/\[/)) {
        throw new Error('Unclosed token in cache entry name pattern.');
      }

      if (!patternWithoutTokens.match(/^[A-z0-9-_\/]*$/)) {
        throw new Error(
          'Cache entry name pattern contains an invalid character. ' +
            'Only alphanumeric characters, slashes, underscores, and hyphens are allowed.'
        );
      }

      let foundHashToken: boolean = false;
      const templateString: string = pattern.trim().replace(TOKEN_REGEX, (token: string) => {
        token = token.substring(1, token.length - 1);
        let tokenName: string;
        let tokenAttribute: string | undefined;
        const tokenSplitIndex: number = token.indexOf(':');
        if (tokenSplitIndex === -1) {
          tokenName = token;
        } else {
          tokenName = token.substr(0, tokenSplitIndex);
          tokenAttribute = token.substr(tokenSplitIndex + 1);
        }

        switch (tokenName) {
          case HASH_TOKEN_NAME: {
            if (tokenAttribute !== undefined) {
              throw new Error(`An attribute isn\'t supported for the "${tokenName}" token.`);
            }

            foundHashToken = true;
            return `\${${OPTIONS_ARGUMENT_NAME}.projectStateHash}`;
          }

          case PROJECT_NAME_TOKEN_NAME: {
            switch (tokenAttribute) {
              case undefined: {
                return `\${${OPTIONS_ARGUMENT_NAME}.projectName}`;
              }

              case 'normalize': {
                return `\${${OPTIONS_ARGUMENT_NAME}.projectName.replace('@','').replace(/\\+/g, '++').replace(/\\/\/g, '+')}`;
              }

              default: {
                throw new Error(`Unexpected attribute "${tokenAttribute}" for the "${tokenName}" token.`);
              }
            }
          }

          case PHASE_NAME_TOKEN_NAME: {
            switch (tokenAttribute) {
              case undefined: {
                throw new Error(
                  'Either the "normalize" or the "trimPrefix" attribute is required ' +
                    `for the "${tokenName}" token.`
                );
              }

              case 'normalize': {
                // Replace colons with underscores.
                return `\${${OPTIONS_ARGUMENT_NAME}.phaseName.replace(/:/g, '_')}`;
              }

              case 'trimPrefix': {
                // Trim the "_phase:" prefix from the phase name.
                return `\${${OPTIONS_ARGUMENT_NAME}.phaseName.replace(/^_phase:/, '')}`;
              }

              default: {
                throw new Error(`Unexpected attribute "${tokenAttribute}" for the "${tokenName}" token.`);
              }
            }
          }

          default: {
            throw new Error(`Unexpected token name "${tokenName}".`);
          }
        }
      });

      if (!foundHashToken) {
        throw new Error(`Cache entry name pattern is missing a [${HASH_TOKEN_NAME}] token.`);
      }

      // eslint-disable-next-line no-new-func
      return new Function(
        OPTIONS_ARGUMENT_NAME,
        `"use strict"\nreturn \`${templateString}\`;`
      ) as GetCacheEntryIdFunction;
    }
  }
}
