// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { PackageJsonLookup } from '@rushstack/node-core-library';

import { ProductionDaemonRequestResolver } from '../../ProductionDaemonRequestResolver';
import { RushDaemonRequestResolver } from '../../RushDaemonRequestResolver';
import { WorkspaceSession } from '../../WorkspaceSession';
import { serveRushDaemonAsync } from '../../serveRushDaemon';
import {
  getInstalledWorkspaceSuccessorLaunchAsync,
  type IWorkspaceSuccessorLaunch
} from '../../WorkspaceProcessRestart';

interface IControl {
  readonly disposalPort: number;
}

async function runAsync(): Promise<void> {
  const repoRoot: string | undefined = process.argv[2];
  const controlFolder: string | undefined = process.argv[3];
  if (!repoRoot || !controlFolder)
    throw new Error('The standalone fixture needs repository and control folders.');
  const controlFile: string = path.join(controlFolder, 'mutation.json');
  await serveRushDaemonAsync({
    repoRoot,
    rushVersion: Rush.version,
    daemonVersion: PackageJsonLookup.loadOwnPackageJson(__dirname).version,
    requestResolver: new RushDaemonRequestResolver(new ProductionDaemonRequestResolver()),
    getSuccessorLaunchAsync: async (context) => {
      const launch: IWorkspaceSuccessorLaunch = await getInstalledWorkspaceSuccessorLaunchAsync(context);
      return {
        ...launch,
        startCommand: {
          ...launch.startCommand,
          args: [
            '--require',
            path.join(__dirname, 'SuccessfulMutationSuccessorMarker.js'),
            ...launch.startCommand.args
          ]
        }
      };
    },
    createWorkspaceSessionAsync: async (options) => {
      const session: WorkspaceSession = await WorkspaceSession.createAsync(options);
      const disposeAsync: () => Promise<void> = session[Symbol.asyncDispose].bind(session);
      let disposal: Promise<void> | undefined;
      session[Symbol.asyncDispose] = (): Promise<void> => {
        disposal ??= (async () => {
          if (session.operationGraph && fs.existsSync(controlFile)) {
            const control: IControl = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
            await pauseDisposalAsync(control.disposalPort);
            await disposeAsync();
            fs.appendFileSync(path.join(controlFolder, 'events.txt'), 'old-resources-disposed\n');
          } else {
            await disposeAsync();
          }
        })();
        return disposal;
      };
      return session;
    },
    onReady: (host) => {
      const filename: string = path.join(controlFolder, 'ready.json');
      fs.writeFileSync(`${filename}.tmp`, JSON.stringify({ paths: host.paths, pid: process.pid }));
      fs.renameSync(`${filename}.tmp`, filename);
    },
    onError: (error) => process.stderr.write(`${error.stack ?? error.message}\n`)
  });
}

function pauseDisposalAsync(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket: net.Socket = net.connect(port, '127.0.0.1');
    socket.once('error', reject);
    socket.once('data', () => {
      socket.end();
      resolve();
    });
  });
}

if (require.main === module) {
  void runAsync().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
