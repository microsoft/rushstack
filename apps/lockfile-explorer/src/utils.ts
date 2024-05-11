// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as dp from '@pnpm/dependency-path';

/**
 * This operation exactly mirrors the behavior of PNPM's own implementation:
 * https://github.com/pnpm/pnpm/blob/73ebfc94e06d783449579cda0c30a40694d210e4/lockfile/lockfile-file/src/experiments/inlineSpecifiersLockfileConverters.ts#L162
 */
export function convertLockfileV6DepPathToV5DepPath(newDepPath: string): string {
  if (!newDepPath.includes('@', 2) || newDepPath.startsWith('file:')) return newDepPath;
  const index = newDepPath.indexOf('@', newDepPath.indexOf('/@') + 2);
  if (newDepPath.includes('(') && index > dp.indexOfPeersSuffix(newDepPath)) return newDepPath;
  return `${newDepPath.substring(0, index)}/${newDepPath.substring(index + 1)}`;
}
