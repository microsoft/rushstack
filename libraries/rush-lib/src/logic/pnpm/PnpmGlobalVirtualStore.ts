// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { Subspace } from '../../api/Subspace';

/**
 * Whether the PNPM global virtual store applies to this subspace: the environment variable
 * enables it repo-wide, and a subspace's pnpm-config.json can opt out with `"globalVirtualStore": false`.
 */
export function isPnpmGlobalVirtualStoreEnabled(subspace: Subspace): boolean {
  return (
    EnvironmentConfiguration.enablePnpmGlobalVirtualStore &&
    subspace.getPnpmOptions()?.globalVirtualStore !== false
  );
}
