// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { Subspace } from '../../api/Subspace';

/**
 * Whether the PNPM global virtual store applies to this subspace: the environment variable
 * enables it repo-wide, and a subspace opts out with `"globalVirtualStore": false` in its
 * pnpm-config.json or by being listed in RUSH_PNPM_GLOBAL_VIRTUAL_STORE_EXCLUDE_SUBSPACES.
 */
export function isPnpmGlobalVirtualStoreEnabled(subspace: Subspace): boolean {
  return (
    EnvironmentConfiguration.enablePnpmGlobalVirtualStore &&
    !EnvironmentConfiguration.pnpmGlobalVirtualStoreExcludedSubspaces.has(subspace.subspaceName) &&
    subspace.getPnpmOptions()?.globalVirtualStore !== false
  );
}
