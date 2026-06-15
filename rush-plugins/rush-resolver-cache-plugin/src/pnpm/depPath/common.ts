// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Shared logic for pnpm 9+ depPathToFilename implementations.
// The depPathToFilenameUnescaped function and overall depPathToFilename structure
// are identical between pnpm 9 and 10; only the hash function, hash length, and
// special-character regex differ.

const TRAILING_PAREN_REGEX: RegExp = /\)$/;
const PARENS_REGEX: RegExp = /\)\(|\(|\)/g;

export function depPathToFilenameUnescaped(depPath: string): string {
  if (depPath.indexOf('file:') !== 0) {
    if (depPath[0] === '/') {
      depPath = depPath.substring(1);
    }
    const index: number = depPath.indexOf('@', 1);
    if (index === -1) return depPath;
    return `${depPath.substring(0, index)}@${depPath.slice(index + 1)}`;
  }
  return depPath.replace(':', '+');
}

export interface IDepPathToFilenameOptions {
  specialCharsRegex: RegExp;
  maxLengthWithoutHash: number;
  hashFn: (input: string) => string;
}

export function createDepPathToFilename(options: IDepPathToFilenameOptions): (depPath: string) => string {
  const { specialCharsRegex, maxLengthWithoutHash, hashFn } = options;
  return (depPath: string): string => {
    let filename: string = depPathToFilenameUnescaped(depPath).replace(specialCharsRegex, '+');
    if (filename.includes('(')) {
      filename = filename.replace(TRAILING_PAREN_REGEX, '').replace(PARENS_REGEX, '_');
    }
    if (filename.length > 120 || (filename !== filename.toLowerCase() && !filename.startsWith('file+'))) {
      return `${filename.substring(0, maxLengthWithoutHash)}_${hashFn(filename)}`;
    }
    return filename;
  };
}
