// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Lockfile v9 key format (used by pnpm 9 and 10): keys have no leading '/'.

export function buildDependencyKey(name: string, specifier: string): string {
  return `${name}@${specifier}`;
}
