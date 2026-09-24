// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { JsonFile } from '@rushstack/node-core-library';
import type { IConnectOrStartDaemonOptions } from '@rushstack/rush-client-core';
import { computeDaemonWorkspaceKey, resolveDaemonPathsFromProcess } from '@rushstack/rush-daemon-transport';
import { readDaemonInstallationMetadata } from '@rushstack/rush-daemon/lib/DaemonInstallation';
import type * as VersionSelectedDaemonLauncherModule from '@rushstack/rush-daemon/lib/VersionSelectedDaemonLauncher';

import { getBundledRushVersion, loadVersionSelectedDaemonLauncher } from './lazyRushModules';

export function getDaemonConnectionOptions(
  repoRoot: string,
  rushVersion: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  autoStart: boolean
): IConnectOrStartDaemonOptions {
  const canonicalRepoRoot: string = fs.realpathSync.native(repoRoot);
  const daemonPackagePath: string = require.resolve('@rushstack/rush-daemon/package.json');
  const daemonPackage: { version: string; bin: { rushd: string } } = JsonFile.load(daemonPackagePath);
  if (autoStart && readDaemonInstallationMetadata(daemonPackagePath).rushVersion !== rushVersion) {
    throw new (loadVersionSelectedDaemonLauncher().DaemonLauncherUnavailableError)(
      rushVersion,
      'The synchronous launcher only supports its installed engine; use asynchronous version selection.'
    );
  }
  return {
    paths: resolveDaemonPathsFromProcess(computeDaemonWorkspaceKey({ canonicalRepoRoot, rushVersion })),
    expectedDaemonVersion: daemonPackage.version,
    startCommand: autoStart
      ? loadVersionSelectedDaemonLauncher().getSelectedDaemonStartCommand(daemonPackagePath, {
          repoRoot: canonicalRepoRoot,
          rushVersion,
          environment
        })
      : undefined
  };
}

/** Resolves an attested launcher before startup; connect-only invocations never install packages. */
export async function getDaemonConnectionOptionsAsync(
  repoRoot: string,
  rushVersion: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  autoStart: boolean
): Promise<IConnectOrStartDaemonOptions> {
  const options: IConnectOrStartDaemonOptions = getDaemonConnectionOptions(
    repoRoot,
    rushVersion,
    environment,
    false
  );
  if (!autoStart) return { paths: options.paths };
  if (rushVersion === getBundledRushVersion()) {
    const daemonPackagePath: string = require.resolve('@rushstack/rush-daemon/package.json');
    if (readDaemonInstallationMetadata(daemonPackagePath).rushVersion !== rushVersion) {
      // Preserve the eager synchronous launcher error.
      return getDaemonConnectionOptions(repoRoot, rushVersion, environment, true);
    }
    // The bundled runtime's bootstrap re-attests before binding. Resolve it only if a start is needed.
    return {
      ...options,
      resolveStartCommandAsync: async () =>
        getDaemonConnectionOptions(repoRoot, rushVersion, environment, true).startCommand!
    };
  }
  const { selectDaemonLauncherAsync } = loadVersionSelectedDaemonLauncher();
  const launch: VersionSelectedDaemonLauncherModule.IVersionSelectedDaemonLaunch =
    await selectDaemonLauncherAsync({
      repoRoot: fs.realpathSync.native(repoRoot),
      rushVersion,
      environment
    });
  return { ...options, expectedDaemonVersion: launch.daemonVersion, startCommand: launch.startCommand };
}
