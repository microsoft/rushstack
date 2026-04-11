// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// pnpm 8: lockfile v6 (keys start with '/'), store v3, MD5 base32 hash

import type { IPnpmVersionHelpers } from '.';
import { depPathToFilename } from './depPath/v8';
import { buildDependencyKey } from './keys/v6';
import { getStoreIndexPath } from './store/v3';

export const helpers: IPnpmVersionHelpers = {
  depPathToFilename,
  buildDependencyKey,
  getStoreIndexPath
};
