// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { serveRushDaemonAsync } from '@rushstack/rush-daemon';
import type { RushDaemonHost } from '@rushstack/rush-daemon';

import { RushConfiguration } from '../api/RushConfiguration';
import { Rush } from '../api/Rush';

/**
 * Internal entry point for the version-selected `rushd` command.
 *
 * @internal
 */
export class RushDaemonCommandLine {
  public static async launchAsync(): Promise<void> {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation();
    await serveRushDaemonAsync({
      daemonVersion: Rush.version,
      repoRoot: rushConfiguration.rushJsonFolder,
      rushVersion: Rush.version,
      onError: (error: Error) => process.stderr.write(`${error.stack ?? error.message}\n`),
      onReady: (host: RushDaemonHost) => {
        process.stdout.write(`rushd ready at ${host.paths.socketPath}\n`);
      }
    });
  }
}
