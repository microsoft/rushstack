// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Store v3 index path format (used by pnpm 8 and 9):
// {storeDir}/v3/files/{hash[0:2]}/{hash[2:]}-index.json

import type { IResolverContext } from '../../types';

// eslint-disable-next-line @typescript-eslint/naming-convention
export function getStoreIndexPath(pnpmStorePath: string, _context: IResolverContext, hash: string): string {
  return `${pnpmStorePath}/v3/files/${hash.slice(0, 2)}/${hash.slice(2)}-index.json`;
}
