// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// pnpm 10: lockfile v9 (keys have no leading '/'), store v10, SHA-256 hex hash

import type { IPnpmVersionHelpers } from './pnpmVersionHelpers';
import { depPathToFilename } from './depPath/v10';
import { buildDependencyKey } from './keys/v9';
import { getStoreIndexPath } from './store/v10';

export const helpers: IPnpmVersionHelpers = {
  depPathToFilename,
  buildDependencyKey,
  getStoreIndexPath
};
