// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { captureDaemonInstallation, getDaemonInstallationFolders } from './DaemonInstallationMonitor';
import { DaemonShutdownDeadlineError } from './DaemonShutdownDeadlineError';
import { DaemonShutdownError } from './DaemonShutdownError';
import { listenForShutdownSignals } from './DaemonShutdownSignals';
import { RushDaemonHost } from './RushDaemonHost';
import type { IRushDaemonHostOptions } from './RushDaemonHost';
import { getInstalledWorkspaceSuccessorLaunchAsync } from './WorkspaceProcessRestart';

/**
 * Options for the daemon serve lifecycle.
 *
 * @beta
 */
export interface IRushDaemonServeOptions extends IRushDaemonHostOptions {
  /** Called after the listener is bound and the lockfile is available. */
  readonly onReady?: (host: RushDaemonHost) => void | Promise<void>;
  /**
   * Requests a clean shutdown. When omitted, the daemon owns its process: the first SIGINT or SIGTERM requests a
   * clean shutdown, and {@link IRushDaemonHostOptions.shutdownDeadlineMs} defaults to 10 seconds. If the shutdown
   * does not finish by then, or another signal arrives first, the daemon reports why, releases what it safely can
   * and exits the process with code 1. Once it stops, if something else keeps the process running for 2 seconds,
   * it writes its PID, when it stopped and the active resources that Node.js lists to the daemon log
   * ({@link IRushDaemonHostOptions.onLog}, or stderr without it) and exits the process, keeping
   * `process.exitCode`. An embedded daemon never exits the process.
   */
  readonly shutdownSignal?: AbortSignal;
}

/**
 * How long a daemon that owns its process waits for its shutdown to finish before it exits anyway. It covers the
 * 5 seconds for which a closing connection waits for its requests.
 */
export const DEFAULT_SHUTDOWN_DEADLINE_MS: number = 10000;

/**
 * How long a daemon that owns its process waits, after it stops serving, for the process to end by itself before it
 * exits anyway. By then it has released its socket and lockfile, so `daemon status` and `daemon stop` can no longer
 * see it; a timer or handle that something else left behind (a plugin, a tool, an SDK) must not keep it running.
 */
const EXIT_AFTER_STOP_MS: number = 2000;

/**
 * Starts a daemon host, signals readiness, and serves until shutdown is requested.
 *
 * @remarks
 * Unless `checkInstallation` is given, the host checks the folders that this process loaded the daemon and the
 * Rush engine from before each request. After one of them was removed or replaced, it starts no more requests
 * and exits once running requests finish.
 *
 * @beta
 */
export async function serveRushDaemonAsync(options: IRushDaemonServeOptions): Promise<void> {
  if (options.shutdownSignal) {
    await serveUntilClosedAsync(options, { signal: options.shutdownSignal, dispose: () => undefined });
    return;
  }
  let host: RushDaemonHost | undefined;
  const signalRegistration: IShutdownSignalRegistration = listenForShutdownSignals({
    emitter: process,
    onForce: (signal: NodeJS.Signals) => {
      // Nothing to release before the host has started.
      if (host) host.expireShutdownDeadline(`a second ${signal}`);
      else process.exit(1);
    }
  });
  try {
    await serveUntilClosedAsync(
      { ...options, shutdownDeadlineMs: options.shutdownDeadlineMs ?? DEFAULT_SHUTDOWN_DEADLINE_MS },
      signalRegistration,
      (startedHost: RushDaemonHost) => (host = startedHost)
    );
  } catch (error) {
    if (host && error instanceof DaemonShutdownDeadlineError) exitAfterShutdownDeadline(host, error, options);
    throw error;
  } finally {
    exitIfStillRunning(options);
  }
}

async function serveUntilClosedAsync(
  options: IRushDaemonServeOptions,
  signalRegistration: IShutdownSignalRegistration,
  onStarted?: (host: RushDaemonHost) => void
): Promise<void> {
  let host: RushDaemonHost | undefined;
  try {
    host = await RushDaemonHost.startAsync({
      ...options,
      checkInstallation:
        options.checkInstallation ?? captureDaemonInstallation(getDaemonInstallationFolders()),
      getSuccessorLaunchAsync:
        options.getSuccessorLaunchAsync ??
        (async (context) => {
          if (options.startupOptions && Object.keys(options.startupOptions).length > 0) {
            throw new Error('Custom startup options require an explicit successor launcher.');
          }
          return await getInstalledWorkspaceSuccessorLaunchAsync(context);
        })
    });
    onStarted?.(host);
    await options.onReady?.(host);
    await waitForShutdownAsync(host, signalRegistration.signal);
    await host.closeAsync(getShutdownReason(signalRegistration.signal));
    await host.restartCompleted;
  } finally {
    try {
      await host?.closeAsync();
    } finally {
      signalRegistration.dispose();
    }
  }
}

/**
 * Exits a daemon process whose shutdown was cut short. The requests that did not finish already have their typed
 * results. The 'exit' hook of SubprocessTerminator kills the child processes that it tracks.
 */
function exitAfterShutdownDeadline(
  host: RushDaemonHost,
  error: DaemonShutdownDeadlineError,
  options: IRushDaemonServeOptions
): never {
  let outcome: string;
  try {
    outcome = host.releaseForExit()
      ? 'The daemon released its socket, lockfile and repository lock, and exits.'
      : 'The daemon exits and leaves its socket and lockfile to the next daemon, which reaps its child processes.';
  } catch (releaseError) {
    outcome = `The daemon exits; it could not release its socket and lockfile: ${String(releaseError)}`;
  }
  const report: Error = new Error(`${error.message} ${outcome}`, { cause: error });
  reportBeforeExit(report, options);
  process.exit(1);
}

/**
 * Exits the process {@link EXIT_AFTER_STOP_MS} after the daemon stopped serving, if it is still running then, and
 * logs what kept it running. The timer does not keep the process running itself. `process.exit()` keeps an exit
 * code that the caller set, and the 'exit' hook of SubprocessTerminator kills the child processes that it still
 * tracks. A successor daemon is not one of them: it is started detached and untracked.
 */
function exitIfStillRunning(options: IRushDaemonServeOptions): void {
  const stoppedAt: string = new Date().toISOString();
  setTimeout(() => {
    // Not a failure, so no stack. The log is shared by every daemon of the workspace, hence the PID and the time.
    logBeforeExit(
      `rushd (PID ${process.pid}) stopped at ${stoppedAt}, but something kept its process running for ` +
        `${EXIT_AFTER_STOP_MS / 1000} s, so it exits now. Active resources that Node.js reports: ` +
        `${describeActiveResources()}.`,
      options
    );
    process.exit();
  }, EXIT_AFTER_STOP_MS).unref();
}

function describeActiveResources(): string {
  const counts: Map<string, number> = new Map();
  for (const resource of process.getActiveResourcesInfo()) {
    counts.set(resource, (counts.get(resource) ?? 0) + 1);
  }
  const resources: string[] = [];
  for (const [resource, count] of counts) {
    resources.push(count > 1 ? `${resource} (${count})` : resource);
  }
  return resources.length > 0 ? resources.join(', ') : 'none';
}

/**
 * Reports an error right before `process.exit()`. Without `onError`, the report is written synchronously:
 * `process.emitWarning` prints on the next tick, which never comes.
 */
function reportBeforeExit(report: Error, options: IRushDaemonServeOptions): void {
  if (options.onError) {
    options.onError(report);
    return;
  }
  writeToStderrBeforeExit(report.stack ?? report.message);
}

/** Writes a message for the daemon log right before `process.exit()`, synchronously without `onLog`. */
function logBeforeExit(message: string, options: IRushDaemonServeOptions): void {
  if (options.onLog) {
    options.onLog(message);
    return;
  }
  writeToStderrBeforeExit(message);
}

function writeToStderrBeforeExit(text: string): void {
  try {
    fs.writeSync(process.stderr.fd, `${text}\n`);
  } catch {
    // The process exits either way.
  }
}

function getShutdownReason(signal: AbortSignal): DaemonShutdownError | undefined {
  if (!signal.aborted) return undefined;
  return signal.reason instanceof DaemonShutdownError
    ? signal.reason
    : new DaemonShutdownError({ initiator: 'host' });
}

interface IShutdownSignalRegistration {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

function waitForShutdownAsync(host: RushDaemonHost, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve: () => void) => {
    const onAbort: () => void = () => resolve();
    signal.addEventListener('abort', onAbort, { once: true });
    void host.closed.then(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}
