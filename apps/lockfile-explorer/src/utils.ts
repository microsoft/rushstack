// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as dp from '@pnpm/dependency-path';

/**
 * Example: "" --> ""
 * Example: "" --> ""
 */
export function convertLockfileV5DepPathToV6DepPath(newDepPath: string): string {
  if (newDepPath.startsWith('file:')) return newDepPath;
  const index = newDepPath.indexOf('/', 2);
  if (newDepPath.includes('(') && index > dp.indexOfPeersSuffix(newDepPath)) return newDepPath;
  return `${newDepPath.substring(0, index)}@${newDepPath.substring(index + 1)}`;
}

export function convertLockfileV6DepPathToV5DepPath(newDepPath: string): string {
  if (!newDepPath.includes('@', 2) || newDepPath.startsWith('file:')) return newDepPath;
  const index = newDepPath.indexOf('@', newDepPath.indexOf('/@') + 2);
  if (newDepPath.includes('(') && index > dp.indexOfPeersSuffix(newDepPath)) return newDepPath;
  return `${newDepPath.substring(0, index)}/${newDepPath.substring(index + 1)}`;
}
