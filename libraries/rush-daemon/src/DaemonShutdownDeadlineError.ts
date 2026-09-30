// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The step of a daemon shutdown that was still running when it was cut short.
 *
 * @beta
 */
export type DaemonShutdownStage =
  | 'requests'
  | 'workspaceMaintenance'
  | 'requestDispatcher'
  | 'workspaceSession'
  | 'cacheWrites'
  | 'listener';

/**
 * Options for {@link DaemonShutdownDeadlineError}.
 *
 * @beta
 */
export interface IDaemonShutdownDeadlineErrorOptions {
  /** How long the shutdown had been running. */
  readonly elapsedMs: number;
  /** What cut the shutdown short before its deadline, such as "a second SIGTERM". Omitted when the deadline did. */
  readonly forcedBy?: string;
  /** The step that was still running. */
  readonly stage: DaemonShutdownStage;
  /** A description of each request that had not finished. */
  readonly unfinishedRequests: ReadonlyArray<string>;
}

/**
 * Reports a daemon shutdown that was cut short, by its deadline or by a second signal, before its cleanup
 * finished. The cleanup may still be running.
 *
 * @remarks
 * A daemon process that gets it releases what it safely can and exits, instead of waiting forever for an await
 * that ignores cancellation, such as a lock that another process holds.
 *
 * @beta
 */
export class DaemonShutdownDeadlineError extends Error {
  /** How long the shutdown had been running when it was cut short. */
  public readonly elapsedMs: number;
  /** What cut the shutdown short before its deadline, such as "a second SIGTERM". Undefined when the deadline did. */
  public readonly forcedBy: string | undefined;
  /** The step that was still running. */
  public readonly stage: DaemonShutdownStage;
  /** A description of each request that had not finished, such as `"build -t a" (running for 12.3 s)`. */
  public readonly unfinishedRequests: ReadonlyArray<string>;

  public constructor(options: IDaemonShutdownDeadlineErrorOptions) {
    super(formatMessage(options));
    this.name = 'DaemonShutdownDeadlineError';
    this.elapsedMs = options.elapsedMs;
    this.forcedBy = options.forcedBy;
    this.stage = options.stage;
    this.unfinishedRequests = options.unfinishedRequests;
  }
}

const MS_PER_SECOND: number = 1000;

function formatMessage(options: IDaemonShutdownDeadlineErrorOptions): string {
  const elapsed: string = `${(options.elapsedMs / MS_PER_SECOND).toFixed(1)} s`;
  const ending: string =
    options.forcedBy === undefined
      ? `did not finish within ${elapsed}`
      : `was cut short by ${options.forcedBy} after ${elapsed}`;
  const requests: string =
    options.unfinishedRequests.length > 0
      ? ` Unfinished requests: ${options.unfinishedRequests.join('; ')}.`
      : '';
  return `The Rush daemon's shutdown ${ending}, while ${describeStage(options.stage)}.${requests}`;
}

function describeStage(stage: DaemonShutdownStage): string {
  switch (stage) {
    case 'requests':
      return 'waiting for requests to finish';
    case 'workspaceMaintenance':
      return 'stopping workspace maintenance';
    case 'requestDispatcher':
      return 'disposing the request dispatcher';
    case 'workspaceSession':
      return 'disposing the workspace session';
    case 'cacheWrites':
      return 'stopping the build cache writes';
    case 'listener':
      return 'closing the listener';
  }
}
