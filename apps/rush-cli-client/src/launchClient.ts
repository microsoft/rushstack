// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Writable } from 'node:stream';

import {
  Rush,
  RushConfiguration,
  daemonEnvironmentVariables,
  resolveDaemonConfiguration,
  type IDaemonConfigurationJson
} from '@microsoft/rush-lib';
import { JsonFile } from '@rushstack/node-core-library';
import {
  DaemonClientError,
  captureDaemonRequest,
  connectOrStartDaemonAsync,
  type DaemonClient,
  type DaemonClientOutcome
} from '@rushstack/rush-client-core';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  resolveDaemonPathsFromProcess,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';
import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { selectClientRoute, type IClientRoute } from './routing';

interface IWorkspaceJson {
  readonly rushVersion: string;
  readonly daemon?: IDaemonConfigurationJson;
}

export async function launchClientAsync(rushx: boolean): Promise<void> {
  const cwd: string = process.cwd();
  const environment: Readonly<NodeJS.ProcessEnv> = Object.freeze({ ...process.env });
  const rushJsonPath: string | undefined = RushConfiguration.tryFindRushJsonLocation({ startingFolder: cwd });
  const workspace: IWorkspaceJson | undefined = rushJsonPath ? JsonFile.load(rushJsonPath) : undefined;
  const config: Readonly<Required<IDaemonConfigurationJson>> = resolveDaemonConfiguration(
    workspace?.daemon,
    environment
  );
  const route: IClientRoute = selectClientRoute({
    argv: process.argv.slice(2),
    environment,
    enabled: config.enabled,
    rushx
  });
  const selectedVersion: string = environment.RUSH_PREVIEW_VERSION ?? workspace?.rushVersion ?? Rush.version;
  if (!rushx && route.commandName === 'daemon') {
    throw new Error(
      environment.RUSH_DAEMON_EXPERIMENTAL === '1'
        ? 'Daemon management and graph verbs require a host protocol that is not available in this build.'
        : 'Daemon management requires host lifecycle controls. Experimental graph commands also require RUSH_DAEMON_EXPERIMENTAL=1.'
    );
  }
  if (!route.daemon || !rushJsonPath || !process.stdin.isTTY) {
    launchInProcess(route.argv, rushx, selectedVersion);
    return;
  }
  if (selectedVersion !== Rush.version) {
    process.stderr.write(
      `rush-client: selected Rush ${selectedVersion} has no version-selected daemon launcher; using the existing Rush version selector.\n`
    );
    launchInProcess(route.argv, rushx, selectedVersion);
    return;
  }
  const terminal: ConsoleTerminalProvider = new ConsoleTerminalProvider();
  const repoRoot: string = fs.realpathSync(path.dirname(rushJsonPath));
  const paths: IDaemonPaths = resolveDaemonPathsFromProcess(
    computeDaemonWorkspaceKey({
      canonicalRepoRoot: repoRoot,
      rushVersion: selectedVersion
    })
  );
  const request: IDaemonRequestEnvelope = captureDaemonRequest({
    argv: route.argv,
    commandName: route.commandName!,
    // Until integration-owned command parsing is available, fail closed to custom/exclusive.
    commandOrigin: 'custom',
    cwd,
    environment,
    terminal: {
      isTTY: !!process.stdout.isTTY,
      supportsColor: terminal.supportsColor,
      columns: process.stdout.columns,
      acceptsStdin: true
    },
    admission: { waitTimeoutMs: Math.floor(config.queueTimeoutSeconds * 1000) }
  });
  const daemonPackagePath: string = require.resolve('@rushstack/rush-daemon/package.json');
  const daemonPackage: { version: string; bin: { rushd: string } } = JsonFile.load(daemonPackagePath);
  let client: DaemonClient;
  try {
    client = await connectOrStartDaemonAsync({
      paths,
      expectedDaemonVersion: daemonPackage.version,
      capabilities: {
        isTTY: request.terminal.isTTY,
        columns: request.terminal.columns,
        colorLevel: terminal.supportsColor ? 1 : 0
      },
      startCommand: config.autoStart
        ? {
            command: process.execPath,
            args: [path.resolve(path.dirname(daemonPackagePath), daemonPackage.bin.rushd)],
            cwd: repoRoot,
            environment: request.environment
          }
        : undefined
    });
  } catch (error) {
    if (!(error instanceof DaemonClientError)) throw error;
    process.stderr.write(`rush-client: ${error.message} Using in-process Rush.\n`);
    launchInProcess(route.argv, rushx, selectedVersion);
    return;
  }
  const abort: AbortController = new AbortController();
  const onSignal = (): void => abort.abort();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  let outcome: DaemonClientOutcome;
  try {
    outcome = await client.executeAsync({
      request,
      abortSignal: abort.signal,
      onStdoutAsync: async (bytes) => writeAsync(process.stdout, bytes),
      onStderrAsync: async (bytes) => writeAsync(process.stderr, bytes),
      stdin: process.stdin,
      cancelOnCtrlC: true,
      initialRawMode: !!process.stdin.isRaw,
      setRawMode: (enabled) => {
        process.stdin.setRawMode(enabled);
      }
    });
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
  if (outcome.kind === 'result') {
    process.exitCode = outcome.result.exitCode;
  } else if (outcome.kind === 'rejected') {
    throw new Error(`Daemon rejected the request (${outcome.rejection.code}): ${outcome.rejection.message}`);
  } else if (abort.signal.aborted) {
    process.exitCode = 130;
  } else {
    process.stderr.write(`rush-client: ${outcome.message ?? outcome.reason}; using in-process Rush.\n`);
    launchInProcess(route.argv, rushx, selectedVersion);
  }
}

function launchInProcess(argv: ReadonlyArray<string>, rushx: boolean, selectedVersion: string): void {
  const executable: string = rushx ? 'rushx' : 'rush';
  const rushFolder: string = path.dirname(require.resolve('@microsoft/rush/package.json'));
  process.argv = [process.execPath, path.join(rushFolder, 'bin', executable), ...argv];
  if (selectedVersion !== Rush.version) {
    // Old Rush releases reject new RUSH_* names. Only strip this launcher's own inputs;
    // the request snapshot was captured earlier and is never mutated.
    for (const name of [...Object.values(daemonEnvironmentVariables), 'RUSH_DAEMON_EXPERIMENTAL']) {
      delete process.env[name];
    }
  }
  require('@microsoft/rush/lib/start');
}

function writeAsync(destination: Writable, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    destination.once('error', onError);
    destination.write(bytes, (error?: Error | null) => {
      if (error) {
        reject(error);
      } else {
        destination.removeListener('error', onError);
        resolve();
      }
    });
  });
}
