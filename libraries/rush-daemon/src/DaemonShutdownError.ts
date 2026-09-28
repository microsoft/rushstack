// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * What initiated a daemon shutdown.
 *
 * @beta
 */
export type DaemonShutdownInitiator = 'controlClient' | 'signal' | 'idleTimeout' | 'restart' | 'host';

/**
 * Options for {@link DaemonShutdownError}.
 *
 * @beta
 */
export interface IDaemonShutdownErrorOptions {
  readonly initiator: DaemonShutdownInitiator;
  /** The process signal name, when the initiator is `signal`. */
  readonly signal?: string;
}

/**
 * The typed reason used to abort requests that were still running when the daemon shut down.
 *
 * @remarks
 * Its message is delivered to the affected clients as the request's error message.
 *
 * @beta
 */
export class DaemonShutdownError extends Error {
  public readonly initiator: DaemonShutdownInitiator;
  public readonly signal: string | undefined;

  public constructor(options: IDaemonShutdownErrorOptions) {
    super(
      `The Rush daemon was shut down (${describeInitiator(options)}) while this request was running; ` +
        're-run the command.'
    );
    this.name = 'DaemonShutdownError';
    this.initiator = options.initiator;
    this.signal = options.signal;
  }
}

function describeInitiator(options: IDaemonShutdownErrorOptions): string {
  switch (options.initiator) {
    case 'controlClient':
      return 'requested by "rush-client daemon stop" or "daemon restart"';
    case 'signal':
      return `the daemon process received ${options.signal ?? 'a termination signal'}`;
    case 'idleTimeout':
      return 'idle timeout';
    case 'restart':
      return 'the daemon restarted to apply workspace changes';
    case 'host':
      return 'the daemon host was closed';
  }
}

/** Returns the shutdown reason if the signal was aborted because the daemon shut down. */
export function getDaemonShutdownReason(signal: AbortSignal): DaemonShutdownError | undefined {
  return signal.aborted && signal.reason instanceof DaemonShutdownError ? signal.reason : undefined;
}

/**
 * Returns the cleanup error unless it repeats a shutdown reason that is already the primary error, for example when
 * restoring raw mode fails because shutdown closed the connection.
 */
export function withoutRepeatedShutdownReason(primary: unknown, cleanupError: unknown): unknown {
  return primary instanceof DaemonShutdownError && cleanupError instanceof DaemonShutdownError
    ? undefined
    : cleanupError;
}
