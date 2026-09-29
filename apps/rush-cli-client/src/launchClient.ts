// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { IDaemonConfigurationJson } from '@microsoft/rush-lib';
// A deep import keeps the warm connect path from evaluating the @microsoft/rush-lib entry point.
import {
  daemonEnvironmentVariables,
  resolveDaemonConfiguration
} from '@microsoft/rush-lib/lib/api/DaemonConfiguration';
import { JsonFile } from '@rushstack/node-core-library';
import {
  DaemonClientError,
  captureDaemonRequest,
  connectOrStartDaemonAsync,
  executeWithDaemonRestartAsync,
  type DaemonClient,
  type DaemonClientOutcome,
  type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import type { DaemonVerbosity, IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { executeDaemonCommandAsync } from './daemonCommands';
import { formatAdmissionFailure, getConfiguredAdmission } from './ClientAdmissionControls';
import { ClientOperationRenderer } from './ClientOperationRenderer';
import type { AgentProgressRenderer } from './AgentProgressRenderer';
import {
  CANCELLATION_SIGNALS,
  formatCancellationMessage,
  getSignalExitCode,
  isCancelledOutcome
} from './clientCancellation';
import { getDaemonConnectionOptionsAsync } from './daemonConnectionOptions';
import { readUseRushReporter } from './outputSelection';
import { selectClientRoute, type IClientRoute } from './routing';
import { getResultDiagnostic } from './resultDiagnostics';
import { writeStreamAsync } from './writeStreamAsync';
import {
  getBundledRushVersion,
  loadMinimalRushConfiguration,
  loadVersionSelectedDaemonLauncher,
  tryFindRushJsonLocation
} from './lazyRushModules';

interface IWorkspaceJson {
  readonly rushVersion: string;
  readonly daemon?: IDaemonConfigurationJson;
}

export async function launchClientAsync(
  rushx: boolean,
  agentRenderer?: AgentProgressRenderer
): Promise<void> {
  const cwd: string = process.cwd();
  const environment: Readonly<NodeJS.ProcessEnv> = Object.freeze({ ...process.env });
  const rushJsonPath: string | undefined = tryFindRushJsonLocation(cwd);
  const workspace: IWorkspaceJson | undefined = rushJsonPath ? JsonFile.load(rushJsonPath) : undefined;
  const config: Readonly<Required<IDaemonConfigurationJson>> = resolveDaemonConfiguration(
    workspace?.daemon,
    environment
  );
  const route: IClientRoute = selectClientRoute({
    argv: process.argv.slice(2),
    environment,
    enabled: config.enabled,
    rushx,
    hasTerminal: !!(process.stdin.isTTY || process.stdout.isTTY || process.stderr.isTTY),
    useRushReporter: !rushx && !!rushJsonPath && readUseRushReporter(rushJsonPath)
  });
  const selectedVersion: string =
    environment.RUSH_PREVIEW_VERSION ?? workspace?.rushVersion ?? getBundledRushVersion();
  if (!rushx && route.commandName === 'daemon') {
    agentRenderer?.dispose();
    if ((route.argv[1] === 'start' || route.argv[1] === 'restart') && process.argv.includes('--no-daemon')) {
      throw new Error(`--no-daemon cannot be combined with daemon ${route.argv[1]}.`);
    }
    await executeDaemonCommandAsync({
      argv: route.argv.slice(1),
      environment,
      rushJsonPath,
      rushVersion: selectedVersion,
      admission:
        route.argv[1] === 'graph'
          ? (route.admission ?? { waitTimeoutMs: Math.floor(config.queueTimeoutSeconds * 1000) })
          : route.admission
    });
    return;
  }
  if (!route.daemon || !rushJsonPath || route.commandName === undefined) {
    agentRenderer?.dispose();
    launchInProcess(route.argv, rushx, selectedVersion);
    return;
  }
  const terminal: ConsoleTerminalProvider = new ConsoleTerminalProvider();
  const verbosity: DaemonVerbosity =
    route.argv.includes('--verbose') || route.argv.includes('-v')
      ? 'verbose'
      : agentRenderer
        ? 'normal'
        : 'quiet';
  const request: IDaemonRequestEnvelope = captureDaemonRequest({
    argv: route.argv,
    commandName: route.commandName,
    // The native resolver additionally validates the parsed action; rushx scripts never claim this origin.
    commandOrigin:
      !rushx && ['build', 'rebuild', 'install', 'update'].includes(route.commandName) ? 'built-in' : 'custom',
    invocationKind: rushx ? 'rushx' : 'rush',
    cwd,
    environment,
    terminal: {
      isTTY: !!process.stdout.isTTY,
      supportsColor: terminal.supportsColor,
      columns: process.stdout.columns,
      acceptsStdin: true
    },
    admission:
      route.admission ??
      getConfiguredAdmission({
        queueTimeoutSeconds: config.queueTimeoutSeconds,
        explicit:
          workspace?.daemon?.queueTimeoutSeconds !== undefined ||
          environment[daemonEnvironmentVariables.queueTimeoutSeconds] !== undefined
      })
  });
  let connection: IConnectOrStartDaemonOptions;
  let client: DaemonClient;
  try {
    connection = {
      ...(await getDaemonConnectionOptionsAsync(
        path.dirname(rushJsonPath),
        selectedVersion,
        request.environment,
        config.autoStart
      )),
      capabilities: {
        isTTY: request.terminal.isTTY,
        columns: request.terminal.columns,
        colorLevel: terminal.supportsColor ? 1 : 0,
        verbosity
      }
    };
    client = await connectOrStartDaemonAsync(connection);
  } catch (error) {
    if (
      !(error instanceof DaemonClientError) &&
      !(error instanceof loadVersionSelectedDaemonLauncher().DaemonLauncherUnavailableError)
    )
      throw error;
    agentRenderer?.dispose();
    process.stderr.write(`rush-client: ${error.message} Using in-process Rush.\n`);
    launchInProcess(route.argv, rushx, selectedVersion);
    return;
  }
  const abort: AbortController = new AbortController();
  let cancellationSignal: NodeJS.Signals | undefined;
  // Windows test harnesses emit signals without a name; treat those as Ctrl+C.
  const onSignal = (signal?: NodeJS.Signals): void => {
    cancellationSignal ??= signal ?? 'SIGINT';
    abort.abort();
  };
  for (const signal of CANCELLATION_SIGNALS) process.on(signal, onSignal);
  const renderer: ClientOperationRenderer = new ClientOperationRenderer({
    requestId: request.requestId,
    colorLevel: terminal.supportsColor ? 1 : 0,
    verbosity,
    terminal: {
      get columns() {
        return process.stdout.columns ?? 80;
      },
      get isTTY() {
        return !!process.stdout.isTTY;
      }
    },
    writeAsync: (bytes, stream) =>
      writeStreamAsync(stream === 'stderr' ? process.stderr : process.stdout, bytes)
  });
  let outcome: DaemonClientOutcome | undefined;
  let restartFailure: DaemonClientError | undefined;
  const discoveryLines: string[] = [];
  const writeDiscoveryAsync = async (): Promise<void> => {
    if (discoveryLines.length > 0) {
      await writeStreamAsync(process.stdout, Buffer.from(discoveryLines.splice(0).join('\n') + '\n'));
    }
  };
  try {
    if (rushx) {
      loadMinimalRushConfiguration().MinimalRushConfiguration.loadFromDefaultLocation((line) =>
        discoveryLines.push(line)
      );
    }
    await renderer.initializeAsync();
    agentRenderer?.setPhase('request submitted; preparing the workspace graph');
    outcome = await executeWithDaemonRestartAsync(client, connection, {
      request,
      abortSignal: abort.signal,
      onStdoutAsync: async (bytes, operationId) => {
        if (agentRenderer) return agentRenderer.onLog(bytes, operationId, 'stdout');
        await writeDiscoveryAsync();
        await renderer.writeLogAsync(bytes, operationId, 'stdout');
      },
      onStderrAsync: async (bytes, operationId) => {
        if (agentRenderer) return agentRenderer.onLog(bytes, operationId, 'stderr');
        await writeDiscoveryAsync();
        await renderer.writeLogAsync(bytes, operationId, 'stderr');
      },
      onEventAsync: async (event) =>
        agentRenderer ? agentRenderer.onEvent(event) : renderer.writeEventAsync(event),
      onQueuePositionAsync: agentRenderer
        ? async (position) => agentRenderer.onQueuePosition(position)
        : process.stderr.isTTY
        ? (position) =>
            writeStreamAsync(
              process.stderr,
              Buffer.from(`rush-client: waiting for daemon admission (position ${position}).\n`)
            )
        : undefined,
      stdin: process.stdin,
      requiresStdinEnd: !process.stdin.isTTY,
      cancelOnCtrlC: !!process.stdin.isTTY,
      initialRawMode: !!process.stdin.isRaw,
      setRawMode: process.stdin.isTTY
        ? (enabled) => {
            process.stdin.setRawMode(enabled);
          }
        : undefined
    });
  } catch (error) {
    if (!(error instanceof DaemonClientError)) throw error;
    if (!abort.signal.aborted) {
      // A restart handoff fails only before the request executes, so in-process fallback cannot replay work.
      if (error.code !== 'startupFailed') throw error;
      restartFailure = error;
    }
    // After cancellation, a transport failure (e.g. the cancellation deadline) still means "cancelled".
    outcome = undefined;
  } finally {
    for (const signal of CANCELLATION_SIGNALS) process.removeListener(signal, onSignal);
    try {
      await renderer.closeAsync();
    } finally {
      await client.closeAsync();
    }
  }
  if (restartFailure) {
    agentRenderer?.dispose();
    process.stderr.write(`rush-client: ${restartFailure.message} Using in-process Rush.\n`);
    launchInProcess(route.argv, rushx, selectedVersion);
    return;
  }
  if (outcome === undefined || isCancelledOutcome(outcome, abort.signal.aborted)) {
    const exitCode: number = getSignalExitCode(cancellationSignal ?? 'SIGINT');
    agentRenderer?.finish({ exitCode, errorMessage: 'cancelled' });
    process.exitCode = exitCode;
    // After SIGHUP the terminal may be gone; the exit code is what matters.
    await writeStreamAsync(process.stderr, Buffer.from(formatCancellationMessage(route.commandName))).catch(
      () => undefined
    );
  } else if (outcome.kind === 'result') {
    agentRenderer?.finish(outcome.result);
    process.exitCode = outcome.result.exitCode;
    const diagnostic: string | undefined = getResultDiagnostic(outcome.result);
    if (diagnostic) {
      await writeStreamAsync(process.stderr, Buffer.from(diagnostic));
    } else if (outcome.result.admissionErrorCode) {
      await writeStreamAsync(
        process.stderr,
        Buffer.from(formatAdmissionFailure(outcome.result.admissionErrorCode, request.admission))
      );
    }
  } else if (outcome.kind === 'rejected') {
    agentRenderer?.finish({ exitCode: 1, errorMessage: `daemon rejected the request (${outcome.rejection.code})` });
    throw new Error(`Daemon rejected the request (${outcome.rejection.code}): ${outcome.rejection.message}`);
  } else {
    agentRenderer?.dispose();
    process.stderr.write(`rush-client: ${outcome.message ?? outcome.reason}; using in-process Rush.\n`);
    launchInProcess(route.argv, rushx, selectedVersion);
  }
}

function launchInProcess(argv: ReadonlyArray<string>, rushx: boolean, selectedVersion: string): void {
  const executable: string = rushx ? 'rushx' : 'rush';
  const rushFolder: string = path.dirname(require.resolve('@microsoft/rush/package.json'));
  process.argv = [process.execPath, path.join(rushFolder, 'bin', executable), ...argv];
  if (selectedVersion !== getBundledRushVersion()) {
    // Old Rush releases reject new RUSH_* names. Only strip this launcher's own inputs;
    // the request snapshot was captured earlier and is never mutated.
    for (const name of [...Object.values(daemonEnvironmentVariables), 'RUSH_DAEMON_EXPERIMENTAL']) {
      delete process.env[name];
    }
  }
  require('@microsoft/rush/lib/start');
}
