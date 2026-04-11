// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// pnpm 9: lockfile v9 (keys have no leading '/'), store v3, MD5 base32 hash

import type { IPnpmVersionHelpers } from '.';
// pnpm 9 uses the same dep-path hashing algorithm as pnpm 8 (MD5 base32)
// but a different depPathToFilenameUnescaped (indexOf('@') vs lastIndexOf('/'))
import { depPathToFilename } from './depPath/v9';
import { buildDependencyKey } from './keys/v9';
import { getStoreIndexPath } from './store/v3';

export const helpers: IPnpmVersionHelpers = {
  depPathToFilename,
  buildDependencyKey,
  getStoreIndexPath
};
