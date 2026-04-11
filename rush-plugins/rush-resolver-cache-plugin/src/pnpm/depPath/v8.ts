// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Vendored from \@pnpm/dependency-path\@2.1.8 (pnpm v8.15.9).
// https://github.com/pnpm/pnpm/blob/afe8ecef1f24812845b699c141d52643d1524079/packages/dependency-path/src/index.ts

import { createBase32Hash } from './hash';

const MAX_LENGTH_WITHOUT_HASH: number = 120 - 26 - 1;

const SPECIAL_CHARS_REGEX: RegExp = /[\\/:*?"<>|]/g;
const TRAILING_PAREN_REGEX: RegExp = /\)$/;
const PARENS_REGEX: RegExp = /(\)\()|\(|\)/g;

function depPathToFilenameUnescaped(depPath: string): string {
  if (depPath.indexOf('file:') !== 0) {
    if (depPath[0] === '/') {
      depPath = depPath.substring(1);
    }
    const index: number = depPath.lastIndexOf(
      '/',
      depPath.includes('(') ? depPath.indexOf('(') - 1 : depPath.length
    );
    const name: string = depPath.substring(0, index);
    if (!name) return depPath;
    return `${name}@${depPath.slice(index + 1)}`;
  }
  return depPath.replace(':', '+');
}

export function depPathToFilename(depPath: string): string {
  let filename: string = depPathToFilenameUnescaped(depPath).replace(SPECIAL_CHARS_REGEX, '+');
  if (filename.includes('(')) {
    filename = filename.replace(TRAILING_PAREN_REGEX, '').replace(PARENS_REGEX, '_');
  }
  if (filename.length > 120 || (filename !== filename.toLowerCase() && !filename.startsWith('file+'))) {
    return `${filename.substring(0, MAX_LENGTH_WITHOUT_HASH)}_${createBase32Hash(filename)}`;
  }
  return filename;
}
