// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '@rushstack/node-core-library';

export function matchesWithStar(patternWithStar: string, input: string): boolean {
  // Map "@types/*" --> "^\@types\/.*$"
  const pattern: string =
    '^' +
    patternWithStar
      .split('*')
      .map((x) => Text.escapeRegExp(x))
      .join('.*') +
    '$';
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  const regExp: RegExp = new RegExp(pattern);
  return regExp.test(input);
}
