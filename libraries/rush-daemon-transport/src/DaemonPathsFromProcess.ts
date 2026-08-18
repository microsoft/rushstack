// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import type { IDaemonPaths } from './DaemonPaths';
import { resolveDaemonPaths } from './DaemonPaths';

/**
 * Resolves the daemon paths for a workspace key using the current process's
 * platform, environment, temporary directory, and user id.
 *
 * @remarks
 * This is the production entry point; {@link resolveDaemonPaths} remains the
 * pure, injectable form for tests.
 *
 * @beta
 */
export function resolveDaemonPathsFromProcess(workspaceKey: string): IDaemonPaths {
  return resolveDaemonPaths(
    {
      platform: process.platform,
      env: process.env,
      tmpdir: os.tmpdir(),
      uid: process.getuid?.()
    },
    workspaceKey
  );
}
