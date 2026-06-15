// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Lockfile v6 key format (used by pnpm 8): keys are prefixed with '/'.

export function buildDependencyKey(name: string, specifier: string): string {
  return `/${name}@${specifier}`;
}
