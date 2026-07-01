// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This script is forked as a detached process by `rushd start`.
 * It creates and runs the daemon server.
 */

import * as process from 'node:process';

import { RushdDaemon } from './RushdDaemon';

async function main(): Promise<void> {
  const workspaceRoot: string | undefined = process.argv[2];
  if (!workspaceRoot) {
    throw new Error('Workspace root path is required');
  }

  const daemon: RushdDaemon = new RushdDaemon({ workspaceRoot });
  await daemon.startAsync();
}

main().catch((error) => {
  console.error(`rushd daemon fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
