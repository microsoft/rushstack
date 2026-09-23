// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonStartCommand } from '@rushstack/rush-client-core';

import type { IInstalledDaemonLauncher } from './DaemonInstallation';

// These launch definitions do not load the Rush engine, so that a client can start or reach its
// bundled daemon cheaply. Version selection and installation remain in VersionSelectedDaemonLauncher.

export interface IDaemonLauncherContext {
  readonly repoRoot: string;
  readonly rushVersion: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
}

export class DaemonLauncherUnavailableError extends Error {
  public readonly installation: IInstalledDaemonLauncher | undefined;

  public constructor(rushVersion: string, reason: string, installation?: IInstalledDaemonLauncher) {
    super(`Cannot launch selected Rush ${rushVersion}: ${reason} Use native Rush instead.`);
    this.name = 'DaemonLauncherUnavailableError';
    this.installation = installation;
  }
}

export function getSelectedDaemonStartCommand(
  daemonPackageJsonPath: string,
  context: IDaemonLauncherContext
): IDaemonStartCommand {
  return {
    command: process.execPath,
    args: [
      require.resolve('./SelectedDaemonBootstrap'),
      '--launch',
      daemonPackageJsonPath,
      context.rushVersion,
      context.repoRoot
    ],
    cwd: context.repoRoot,
    environment: Object.freeze(
      Object.fromEntries(
        Object.entries(context.environment).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      )
    )
  };
}
