// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import type { IPackageJson } from '@rushstack/node-core-library';
import { resolveDaemonConfiguration, type IDaemonConfigurationJson } from '@microsoft/rush-lib';

import { serveRushDaemonAsync } from './serveRushDaemon';
import type { IRushDaemonServeOptions } from './serveRushDaemon';

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
  // The WS3 host consumes this launch option. Keeping the launch shape explicit also permits
  // this client/config change to build independently of the host lifecycle workstream.
  const serveOptions: IRushDaemonServeOptions & { readonly idleTimeoutSeconds: number } = {
    daemonVersion: packageJson.version,
    repoRoot: workspace.repoRoot,
    rushVersion: workspace.rushVersion,
    idleTimeoutSeconds: configuration.idleTimeoutSeconds,
    onError: (error: Error) => process.stderr.write(`${error.stack ?? error.message}\n`),
    onReady: (host) => {
      process.stdout.write(`rushd ready at ${host.paths.socketPath}\n`);
    }
  };
  await serveRushDaemonAsync(serveOptions);
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
