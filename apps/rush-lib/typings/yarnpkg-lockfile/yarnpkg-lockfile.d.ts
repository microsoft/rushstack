// Type definitions for @yarnpkg/lockfile 1.0.2
// Project: https://www.npmjs.com/package/@yarnpkg/lockfile
// Definitions by: pgonzal

// NOTE: The entry point is here:
// https://github.com/yarnpkg/yarn/blob/master/src/lockfile/index.js

declare module '@yarnpkg/lockfile' {
  export type ParseResultType = 'merge' | 'success' | 'conflict';

  export type ParseResult = {
    type: ParseResultType,
    object: Object,
  };

  export function parse(str: string, fileLoc?: string): ParseResult;
  export function stringify(obj: Object, noHeader?: boolean, enableVersions?: boolean): string;
}
