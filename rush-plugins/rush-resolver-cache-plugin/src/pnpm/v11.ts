// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// pnpm 11: lockfile v9 (keys have no leading '/'), store v11, SHA-256 hex hash
// The dep-path hashing algorithm is identical to pnpm 10; only the store directory changes.

import type { IPnpmVersionHelpers } from './pnpmVersionHelpers';
// pnpm 11 uses the same dep-path hashing algorithm as pnpm 10 (SHA-256 hex, 32-char prefix)
import { depPathToFilename } from './depPath/v10';
import { buildDependencyKey } from './keys/v9';
import { getStoreIndexPath } from './store/v11';

export const helpers: IPnpmVersionHelpers = {
  depPathToFilename,
  buildDependencyKey,
  getStoreIndexPath
};
