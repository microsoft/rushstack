// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import type { IConnectOrStartDaemonOptions } from '@rushstack/rush-client-core';
import { computeDaemonWorkspaceKey, resolveDaemonPathsFromProcess } from '@rushstack/rush-daemon-transport';

export function getDaemonConnectionOptions(
  repoRoot: string,
  rushVersion: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  autoStart: boolean
): IConnectOrStartDaemonOptions {
  const canonicalRepoRoot: string = fs.realpathSync(repoRoot);
  const daemonPackagePath: string = require.resolve('@rushstack/rush-daemon/package.json');
  const daemonPackage: { version: string; bin: { rushd: string } } = JsonFile.load(daemonPackagePath);
  return {
    paths: resolveDaemonPathsFromProcess(computeDaemonWorkspaceKey({ canonicalRepoRoot, rushVersion })),
    expectedDaemonVersion: daemonPackage.version,
    startCommand: autoStart
      ? {
          command: process.execPath,
          args: [path.resolve(path.dirname(daemonPackagePath), daemonPackage.bin.rushd)],
          cwd: canonicalRepoRoot,
          environment: Object.freeze(
            Object.fromEntries(
              Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined)
            )
          )
        }
      : undefined
  };
}
