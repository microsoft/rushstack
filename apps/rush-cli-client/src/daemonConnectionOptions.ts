// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { JsonFile } from '@rushstack/node-core-library';
import type { IConnectOrStartDaemonOptions } from '@rushstack/rush-client-core';
import { computeDaemonWorkspaceKey, resolveDaemonPathsFromProcess } from '@rushstack/rush-daemon-transport';
import { readDaemonInstallationMetadata } from '@rushstack/rush-daemon/lib/DaemonInstallation';
import {
  DaemonLauncherUnavailableError,
  getSelectedDaemonStartCommand
} from '@rushstack/rush-daemon/lib/DaemonLaunchCommand';
import type { IVersionSelectedDaemonLaunch } from '@rushstack/rush-daemon/lib/VersionSelectedDaemonLauncher';

import { BUNDLED_RUSH_VERSION } from './bundledRushVersion';

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
    throw new DaemonLauncherUnavailableError(
      rushVersion,
      'The synchronous launcher only supports its installed engine; use asynchronous version selection.'
    );
  }
  return {
    paths: resolveDaemonPathsFromProcess(computeDaemonWorkspaceKey({ canonicalRepoRoot, rushVersion })),
    expectedDaemonVersion: daemonPackage.version,
    startCommand: autoStart
      ? getSelectedDaemonStartCommand(daemonPackagePath, {
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
  // The bundled runtime needs no selection; its bootstrap re-attests before binding.
  if (rushVersion === BUNDLED_RUSH_VERSION)
    return getDaemonConnectionOptions(repoRoot, rushVersion, environment, true);
  // Selecting another installation uses the engine's installer APIs, so it is loaded only when needed.
  const { selectDaemonLauncherAsync } = await import(
    '@rushstack/rush-daemon/lib/VersionSelectedDaemonLauncher'
  );
  const launch: IVersionSelectedDaemonLaunch = await selectDaemonLauncherAsync({
    repoRoot: fs.realpathSync.native(repoRoot),
    rushVersion,
    environment
  });
  return { ...options, expectedDaemonVersion: launch.daemonVersion, startCommand: launch.startCommand };
}
