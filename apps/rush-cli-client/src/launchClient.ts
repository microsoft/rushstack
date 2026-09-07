// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

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
import type { DaemonVerbosity, IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import { ConsoleTerminalProvider } from '@rushstack/terminal';
import { MinimalRushConfiguration } from '@microsoft/rush/lib/MinimalRushConfiguration';

import { executeDaemonCommandAsync } from './daemonCommands';
import { ClientOperationRenderer } from './ClientOperationRenderer';
import { getDaemonConnectionOptions } from './daemonConnectionOptions';
import { selectClientRoute, type IClientRoute } from './routing';
import { writeStreamAsync } from './writeStreamAsync';

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
    if ((route.argv[1] === 'start' || route.argv[1] === 'restart') && process.argv.includes('--no-daemon')) {
      throw new Error(`--no-daemon cannot be combined with daemon ${route.argv[1]}.`);
    }
    await executeDaemonCommandAsync({
      argv: route.argv.slice(1),
      environment,
      rushJsonPath,
      rushVersion: selectedVersion,
      admission: route.admission
    });
    return;
  }
  if (!route.daemon || !rushJsonPath || route.commandName === undefined) {
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
  const verbosity: DaemonVerbosity = route.argv.includes('--verbose') || route.argv.includes('-v')
    ? 'verbose'
    : 'quiet';
  const request: IDaemonRequestEnvelope = captureDaemonRequest({
    argv: route.argv,
    commandName: route.commandName,
    // The native resolver additionally validates the parsed action; rushx scripts never claim this origin.
    commandOrigin: !rushx && ['build', 'rebuild'].includes(route.commandName) ? 'built-in' : 'custom',
    invocationKind: rushx ? 'rushx' : 'rush',
    cwd,
    environment,
    terminal: {
      isTTY: !!process.stdout.isTTY,
      supportsColor: terminal.supportsColor,
      columns: process.stdout.columns,
      acceptsStdin: true
    },
    admission: route.admission ?? { waitTimeoutMs: Math.floor(config.queueTimeoutSeconds * 1000) }
  });
  let client: DaemonClient;
  try {
    client = await connectOrStartDaemonAsync({
      ...getDaemonConnectionOptions(
        path.dirname(rushJsonPath),
        selectedVersion,
        request.environment,
        config.autoStart
      ),
      capabilities: {
        isTTY: request.terminal.isTTY,
        columns: request.terminal.columns,
        colorLevel: terminal.supportsColor ? 1 : 0,
        verbosity
      }
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
  const renderer: ClientOperationRenderer = new ClientOperationRenderer({
    requestId: request.requestId,
    colorLevel: terminal.supportsColor ? 1 : 0,
    verbosity,
    terminal: {
      get columns() { return process.stdout.columns ?? 80; },
      get isTTY() { return !!process.stdout.isTTY; }
    },
    writeAsync: (bytes, stream) => writeStreamAsync(
      stream === 'stderr' ? process.stderr : process.stdout, bytes
    )
  });
  let outcome: DaemonClientOutcome;
  const discoveryLines: string[] = [];
  const writeDiscoveryAsync = async (): Promise<void> => {
    if (discoveryLines.length > 0) {
      await writeStreamAsync(process.stdout, Buffer.from(discoveryLines.splice(0).join('\n') + '\n'));
    }
  };
  try {
    if (rushx) MinimalRushConfiguration.loadFromDefaultLocation((line) => discoveryLines.push(line));
    await renderer.initializeAsync();
    outcome = await client.executeAsync({
      request,
      abortSignal: abort.signal,
      onStdoutAsync: async (bytes, operationId) => {
        await writeDiscoveryAsync();
        await renderer.writeLogAsync(bytes, operationId, 'stdout');
      },
      onStderrAsync: async (bytes, operationId) => {
        await writeDiscoveryAsync();
        await renderer.writeLogAsync(bytes, operationId, 'stderr');
      },
      onEventAsync: (event) => renderer.writeEventAsync(event),
      onQueuePositionAsync: process.stderr.isTTY
        ? (position) => writeStreamAsync(
          process.stderr, Buffer.from(`rush-client: waiting for daemon admission (position ${position}).\n`)
        )
        : undefined,
      stdin: process.stdin,
      requiresStdinEnd: !process.stdin.isTTY,
      cancelOnCtrlC: !!process.stdin.isTTY,
      initialRawMode: !!process.stdin.isRaw,
      setRawMode: process.stdin.isTTY ? (enabled) => { process.stdin.setRawMode(enabled); } : undefined
    });
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    try {
      await renderer.closeAsync();
    } finally {
      await client.closeAsync();
    }
  }
  if (outcome.kind === 'result') {
    process.exitCode = outcome.result.exitCode;
    if (outcome.result.admissionErrorCode) {
      await writeStreamAsync(
        process.stderr,
        Buffer.from(`rush-client: daemon admission failed (${outcome.result.admissionErrorCode}).\n`)
      );
    }
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
