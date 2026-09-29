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
  connectOrAwaitDaemonStartupAsync,
  executeWithDaemonRestartAsync,
  reclaimCrashedDaemonAsync,
  type DaemonClient,
  type DaemonClientOutcome,
  type IConnectOrStartDaemonOptions
} from '@rushstack/rush-client-core';
import type { DaemonVerbosity, IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import type { IDaemonOrphanReap, IDaemonPaths } from '@rushstack/rush-daemon-transport';
import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { executeDaemonCommandAsync } from './daemonCommands';
import { getConfiguredAdmission, type ClientName } from './ClientAdmissionControls';
import { ClientOperationRenderer } from './ClientOperationRenderer';
import type { AgentProgressRenderer } from './AgentProgressRenderer';
import { withNativeLockWaitNotices, type INativeLockWaitNoticeHandlers } from './nativeLockWaitNotice';
import {
  CANCELLATION_SIGNALS,
  formatCancellationMessage,
  formatCancellingMessage,
  formatClosedOutputMessage,
  getSignalExitCode,
  isCancelledOutcome
} from './clientCancellation';
import { CLOSED_OUTPUT_EXIT_CODE, ClientOutput, type ClientOutputStream } from './clientOutput';
import { getDaemonConnectionOptionsAsync, getDaemonPaths } from './daemonConnectionOptions';
import { readUseRushReporter, selectClientOutputMode } from './outputSelection';
import { selectClientRoute, type IClientRoute } from './routing';
import { getResultStderr } from './resultDiagnostics';
import { createDaemonLivenessOptions } from './daemonSilence';
import { getTerminalColumns } from './terminalColumns';
import {
  createDaemonRequestNoticeHandlers,
  explainDaemonRestartFailure,
  type IDaemonRequestNoticeHandlers
} from './daemonRestartNotice';
import { formatInProcessFallbackMessage } from './inProcessFallback';
import { createOrphanReapNoticeHandler, writeStderr } from './daemonReclaimNotice';
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
  agentRenderer?: AgentProgressRenderer,
  output: ClientOutput = new ClientOutput()
): Promise<void> {
  const cwd: string = process.cwd();
  const environment: Readonly<NodeJS.ProcessEnv> = Object.freeze({ ...process.env });
  const rushJsonPath: string | undefined = tryFindRushJsonLocation(cwd);
  const workspace: IWorkspaceJson | undefined = rushJsonPath ? JsonFile.load(rushJsonPath) : undefined;
  const config: Readonly<Required<IDaemonConfigurationJson>> = resolveDaemonConfiguration(
    workspace?.daemon,
    environment
  );
  const argv: ReadonlyArray<string> = process.argv.slice(2);
  const useRushReporter: boolean = !rushx && !!rushJsonPath && readUseRushReporter(rushJsonPath);
  const clientName: ClientName = rushx ? 'rushx-client' : 'rush-client';
  const route: IClientRoute = selectClientRoute({
    argv,
    environment,
    enabled: config.enabled,
    rushx,
    hasTerminal: !!(process.stdin.isTTY || process.stdout.isTTY || process.stderr.isTTY),
    useRushReporter
  });
  const selectedVersion: string =
    environment.RUSH_PREVIEW_VERSION ?? workspace?.rushVersion ?? getBundledRushVersion();
  if (!rushx && route.commandName === 'daemon') {
    agentRenderer?.dispose();
    output.release();
    if ((route.argv[1] === 'start' || route.argv[1] === 'restart') && process.argv.includes('--no-daemon')) {
      throw new Error(`--no-daemon cannot be combined with daemon ${route.argv[1]}.`);
    }
    await executeDaemonCommandAsync({
      argv: route.argv.slice(1),
      environment,
      rushJsonPath,
      rushVersion: selectedVersion,
      daemonConfiguration: { enabled: config.enabled, autoStart: config.autoStart },
      admission:
        route.argv[1] === 'graph'
          ? (route.admission ?? { waitTimeoutMs: Math.floor(config.queueTimeoutSeconds * 1000) })
          : route.admission
    });
    return;
  }
  if (!route.daemon || !rushJsonPath || route.commandName === undefined) {
    agentRenderer?.dispose();
    output.release();
    // Agent output says why a command runs in-process; legacy output, which rushx-client always uses, says so only
    // when RUSH_DAEMON=1 asked for the daemon.
    if (
      route.inProcessReason !== undefined &&
      rushJsonPath &&
      (environment.RUSH_DAEMON === '1' ||
        (!rushx && selectClientOutputMode({ argv, environment, useRushReporter }) === 'agent'))
    ) {
      process.stderr.write(formatInProcessFallbackMessage(route.inProcessReason, clientName));
    }
    await launchInProcessAsync(route.nativeArgv, rushx, selectedVersion, rushJsonPath);
    return;
  }
  // start.ts skips the progress line when it guesses that the daemon is off; routing decides.
  agentRenderer?.start();
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
    // An agent acts on a failure as soon as it is known; the daemon finishes the independent work without it.
    ...(agentRenderer ? { returnEarlyOnFailure: true } : {}),
    cwd,
    environment,
    terminal: {
      isTTY: !!process.stdout.isTTY,
      supportsColor: terminal.supportsColor,
      columns: getTerminalColumns(process.stdout),
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
      // A request never reports the warm set, which in a large repo is most of the daemon's ready reply.
      omitWarmSetStatus: true,
      capabilities: {
        isTTY: request.terminal.isTTY,
        columns: request.terminal.columns,
        colorLevel: terminal.supportsColor ? 1 : 0,
        verbosity
      },
      // A reclaim before a start, or after the daemon exited during the command, says what it stopped.
      onOrphansReaped: createOrphanReapNoticeHandler({ rushx, agentRenderer, writeStderr })
    };
    // While a live daemon or starter can still make the daemon ready, a startup failure rejects with a
    // DaemonStartupPendingError, which is not a DaemonClientError, so Rush does not run in-process next to it.
    client = await connectOrAwaitDaemonStartupAsync({
      ...connection,
      onAwaitStartup: (owner: string, waitMs: number): void => {
        if (agentRenderer) {
          agentRenderer.onAwaitStartup(waitMs, owner);
          return;
        }
        const seconds: number = Math.round(waitMs / 1000);
        process.stderr.write(
          `${clientName}: The daemon is not ready yet. ${owner}, so this command waits up to ${seconds} s ` +
            'more for it instead of running Rush in-process.\n'
        );
      }
    });
  } catch (error) {
    if (
      !(error instanceof DaemonClientError) &&
      !(error instanceof loadVersionSelectedDaemonLauncher().DaemonLauncherUnavailableError)
    )
      throw error;
    agentRenderer?.dispose();
    output.release();
    process.stderr.write(formatInProcessFallbackMessage(error.message, clientName));
    await launchInProcessAsync(route.nativeArgv, rushx, selectedVersion, rushJsonPath);
    return;
  }
  const abort: AbortController = new AbortController();
  const commandName: string = route.commandName;
  let cancellationSignal: NodeJS.Signals | undefined;
  // Whether the client asked the daemon to cancel the request: after a signal, or a raw Ctrl+C, which raises none.
  let cancelRequested: boolean = false;
  // The output stream whose reader exited while the request ran, when nothing else had cancelled it first.
  let closedOutput: ClientOutputStream | undefined;
  // Windows test harnesses emit signals without a name; treat those as Ctrl+C.
  const onSignal = (signal?: NodeJS.Signals): void => {
    cancellationSignal ??= signal ?? 'SIGINT';
    abort.abort();
  };
  let notices: IDaemonRequestNoticeHandlers | undefined;
  const onCancelRequested = (timeoutMs: number): void => {
    cancelRequested = true;
    // A line that the request still waits for a daemon restart would contradict the cancelling line.
    notices?.dispose();
    if (agentRenderer) {
      agentRenderer.onCancelRequested(timeoutMs);
      return;
    }
    // One line, written once the request stops, says why it was cancelled.
    if (closedOutput) return;
    // After SIGHUP the terminal may be gone.
    output.stderr
      .writeAsync(Buffer.from(formatCancellingMessage(commandName, timeoutMs, clientName)))
      .catch(() => undefined);
  };
  const isCancelled = (): boolean => abort.signal.aborted || cancelRequested;
  // A reader that exits (for example `| head`) cancels the request, as SIGPIPE stops a native command.
  const onOutputClosed = (stream: ClientOutputStream): void => {
    if (!isCancelled()) closedOutput = stream;
    abort.abort();
  };
  for (const signal of CANCELLATION_SIGNALS) process.on(signal, onSignal);
  const removeOutputListener: () => void = output.onClosed(onOutputClosed);
  const renderer: ClientOperationRenderer = new ClientOperationRenderer({
    requestId: request.requestId,
    colorLevel: terminal.supportsColor ? 1 : 0,
    verbosity,
    terminal: {
      get columns() {
        return getTerminalColumns(process.stdout) ?? 80;
      },
      get isTTY() {
        return !!process.stdout.isTTY;
      }
    },
    writeAsync: (bytes, stream) => (stream === 'stderr' ? output.stderr : output.stdout).writeAsync(bytes)
  });
  let outcome: DaemonClientOutcome | undefined;
  const discoveryLines: string[] = [];
  const writeDiscoveryAsync = async (): Promise<void> => {
    if (discoveryLines.length > 0) {
      await output.stdout.writeAsync(Buffer.from(discoveryLines.splice(0).join('\n') + '\n'));
    }
  };
  try {
    if (rushx) {
      loadMinimalRushConfiguration().MinimalRushConfiguration.loadFromDefaultLocation((line) =>
        discoveryLines.push(line)
      );
    }
    await renderer.initializeAsync();
    agentRenderer?.onRequestSent();
    const writeStderrAsync = (text: string): Promise<void> => output.stderr.writeAsync(Buffer.from(text));
    const requestNotices: INativeLockWaitNoticeHandlers = withNativeLockWaitNotices(
      createDaemonRequestNoticeHandlers({
        rushx,
        agentRenderer,
        stderrIsTTY: !!process.stderr.isTTY,
        daemonPid: (await client.status).pid,
        writeStderrAsync
      }),
      { rushx, agentRenderer, writeStderrAsync }
    );
    notices = requestNotices;
    outcome = await executeWithDaemonRestartAsync(client, connection, {
      request,
      abortSignal: abort.signal,
      onStdoutAsync: async (bytes, operationId) => {
        requestNotices.onRequestProgress();
        if (agentRenderer) return agentRenderer.onLog(bytes, operationId, 'stdout');
        await writeDiscoveryAsync();
        await renderer.writeLogAsync(bytes, operationId, 'stdout');
      },
      onStderrAsync: async (bytes, operationId) => {
        requestNotices.onRequestProgress();
        if (agentRenderer) return agentRenderer.onLog(bytes, operationId, 'stderr');
        await writeDiscoveryAsync();
        await renderer.writeLogAsync(bytes, operationId, 'stderr');
      },
      onEventAsync: async (event) => {
        requestNotices.onRequestProgress();
        return agentRenderer ? agentRenderer.onEvent(event) : renderer.writeEventAsync(event);
      },
      onRestartAsync: requestNotices.onRestartAsync,
      onQueuePositionAsync: requestNotices.onQueuePositionAsync,
      onInputAdmittedAsync: requestNotices.onInputAdmittedAsync,
      stdin: process.stdin,
      requiresStdinEnd: !process.stdin.isTTY,
      cancelOnCtrlC: !!process.stdin.isTTY,
      onCancelRequested,
      liveness: createDaemonLivenessOptions({
        rushx,
        agentRenderer,
        writeStderrAsync: (text) => output.stderr.writeAsync(Buffer.from(text))
      }),
      initialRawMode: !!process.stdin.isRaw,
      setRawMode: process.stdin.isTTY
        ? (enabled) => {
            process.stdin.setRawMode(enabled);
          }
        : undefined
    });
  } catch (error) {
    // After cancellation, a transport failure (e.g. the cancellation deadline) still means "cancelled".
    if (!isCancelled() || !(error instanceof DaemonClientError)) throw explainDaemonRestartFailure(error);
    outcome = undefined;
  } finally {
    notices?.dispose();
    for (const signal of CANCELLATION_SIGNALS) process.removeListener(signal, onSignal);
    removeOutputListener();
    try {
      await renderer.closeAsync();
    } finally {
      await client.closeAsync();
    }
  }
  if (outcome === undefined || isCancelledOutcome(outcome, isCancelled())) {
    const exitCode: number = closedOutput
      ? CLOSED_OUTPUT_EXIT_CODE
      : getSignalExitCode(cancellationSignal ?? 'SIGINT');
    // The client stopped waiting (at the cancellation deadline, or when the connection closed) before the daemon
    // confirmed that the request stopped. The daemon also cancels a request whose client disconnects.
    const stopUnconfirmed: boolean = outcome === undefined && cancelRequested;
    agentRenderer?.finish(
      outcome?.kind === 'result'
        ? { ...outcome.result, exitCode, cancelled: true }
        : { exitCode, cancelled: true, stopUnconfirmed }
    );
    process.exitCode = exitCode;
    // After SIGHUP the terminal may be gone; the exit code is what matters. Agent output's summary line already
    // says whether the daemon confirmed the stop, unless its reader exited: then this line is the only report.
    await output.stderr
      .writeAsync(
        Buffer.from(
          closedOutput
            ? formatClosedOutputMessage(
                commandName,
                closedOutput.name,
                closedOutput.closedCode,
                stopUnconfirmed,
                clientName
              )
            : formatCancellationMessage(commandName, stopUnconfirmed && !agentRenderer, clientName)
        )
      )
      .catch(() => undefined);
  } else if (outcome.kind === 'result') {
    // In agent mode the summary line may already carry the complete error message; do not repeat it.
    const reportedByAgent: boolean = agentRenderer?.finish(outcome.result) ?? false;
    process.exitCode = outcome.result.exitCode;
    // When the agent summary line explains the failure, nothing more is printed.
    const stderr: string | undefined = reportedByAgent
      ? undefined
      : getResultStderr(outcome.result, request.admission, clientName);
    if (stderr) {
      await output.stderr.writeAsync(Buffer.from(stderr));
    }
  } else if (outcome.kind === 'rejected') {
    const message: string = `Daemon rejected the request (${outcome.rejection.code}): ${outcome.rejection.message}`;
    agentRenderer?.finish({ exitCode: 1, errorMessage: message });
    throw new Error(message);
  } else {
    agentRenderer?.dispose();
    output.release();
    process.stderr.write(formatInProcessFallbackMessage(outcome.message ?? outcome.reason, clientName));
    await launchInProcessAsync(route.nativeArgv, rushx, selectedVersion, rushJsonPath);
  }
}

/**
 * Runs Rush in-process. A daemon that crashed while it ran a command can leave its operations running, and
 * they could overwrite this command's outputs, so they are stopped first, as the next daemon start would.
 */
async function launchInProcessAsync(
  argv: ReadonlyArray<string>,
  rushx: boolean,
  selectedVersion: string,
  rushJsonPath: string | undefined
): Promise<void> {
  if (rushJsonPath) {
    let paths: IDaemonPaths | undefined;
    try {
      paths = getDaemonPaths(path.dirname(rushJsonPath), selectedVersion);
    } catch {
      // Without the daemon's folder there is nothing to reclaim; Rush reports a workspace problem itself.
    }
    if (paths) {
      // Any agent renderer was disposed before Rush runs in-process.
      const onOrphansReaped: (reap: IDaemonOrphanReap) => void = createOrphanReapNoticeHandler({
        rushx,
        agentRenderer: undefined,
        writeStderr
      });
      await reclaimCrashedDaemonAsync(paths, { onOrphansReaped });
    }
  }
  launchInProcess(argv, rushx, selectedVersion);
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
