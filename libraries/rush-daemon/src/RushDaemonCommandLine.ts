// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import type { IPackageJson } from '@rushstack/node-core-library';
import { resolveDaemonConfiguration, type IDaemonConfigurationJson } from '@microsoft/rush-lib';

import { serveRushDaemonAsync } from './serveRushDaemon';
import type { IRushDaemonServeOptions } from './serveRushDaemon';
import { ProductionDaemonRequestResolver } from './ProductionDaemonRequestResolver';
import { RushDaemonRequestResolver } from './RushDaemonRequestResolver';

const RUSH_JSON_FILENAME: string = 'rush.json';

export interface IRushDaemonWorkspace {
  readonly repoRoot: string;
  readonly rushVersion: string;
}

export function resolveRushDaemonWorkspace(startingFolder: string): IRushDaemonWorkspace {
  const rushJsonPath: string = findRushJsonPath(startingFolder);
  const rushJson: { rushVersion?: unknown } = JsonFile.load(rushJsonPath);
  if (typeof rushJson.rushVersion !== 'string') {
    throw new Error(`The "rushVersion" field in "${rushJsonPath}" must be a string.`);
  }
  return {
    repoRoot: path.dirname(rushJsonPath),
    rushVersion: rushJson.rushVersion
  };
}

export async function launchRushDaemonAsync(startingFolder: string = process.cwd()): Promise<void> {
  const workspace: IRushDaemonWorkspace = resolveRushDaemonWorkspace(startingFolder);
  const rushJson: { daemon?: IDaemonConfigurationJson } = JsonFile.load(
    path.join(workspace.repoRoot, RUSH_JSON_FILENAME)
  );
  const configuration: Readonly<Required<IDaemonConfigurationJson>> = resolveDaemonConfiguration(
    rushJson.daemon
  );
  const packageJson: IPackageJson | undefined = PackageJsonLookup.instance.tryLoadPackageJsonFor(__dirname);
  if (!packageJson) {
    throw new Error('Unable to determine the @rushstack/rush-daemon package version.');
  }
  const serveOptions: IRushDaemonServeOptions = {
    daemonVersion: packageJson.version,
    repoRoot: workspace.repoRoot,
    rushVersion: workspace.rushVersion,
    requestResolver: new RushDaemonRequestResolver(new ProductionDaemonRequestResolver()),
    idleTimeoutSeconds: configuration.idleTimeoutSeconds,
    onError: (error: Error) => process.stderr.write(`${error.stack ?? error.message}\n`),
    onLog: (message: string) => process.stderr.write(`${new Date().toISOString()} ${message}\n`),
    onReady: (host) => {
      process.stdout.write(
        `${new Date().toISOString()} rushd ready at ${host.paths.socketPath} (PID ${process.pid})\n`
      );
    }
  };
  await serveRushDaemonAsync(serveOptions);
}

/**
 * An 'error' listener for the process's stdout and stderr that lets `rushd` go on without its output once whatever
 * read that output has gone.
 *
 * @remarks
 * After `rushd 2>&1 | tee rushd.log`, Ctrl+C stops `tee` as well as `rushd`. The next write, such as the ready line
 * or the shutdown line, then fails with EPIPE, which Node.js reports as an 'error' event on the stream. Unhandled,
 * that error would end the process with code 1 before the daemon removed its socket and lockfile. Any other error
 * is thrown, as it was without a listener.
 */
export function ignoreClosedReader(error: NodeJS.ErrnoException): void {
  if (error.code !== 'EPIPE') {
    throw error;
  }
}

function findRushJsonPath(startingFolder: string): string {
  let currentFolder: string = path.resolve(startingFolder);
  while (true) {
    const candidatePath: string = path.join(currentFolder, RUSH_JSON_FILENAME);
    if (FileSystem.exists(candidatePath)) {
      return candidatePath;
    }
    const parentFolder: string = path.dirname(currentFolder);
    if (parentFolder === currentFolder) {
      throw new Error(`Unable to find ${RUSH_JSON_FILENAME} in "${startingFolder}" or its parents.`);
    }
    currentFolder = parentFolder;
  }
}
