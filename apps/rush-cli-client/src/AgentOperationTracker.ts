// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it (through AgentProgressRenderer) before
// @microsoft/rush-lib.

import type { IDaemonOperationStatusChangedPayload } from '@rushstack/rush-daemon-protocol';

import { OperationOutputExcerpt } from './OperationOutputExcerpt';

const FAILURE: string = 'FAILURE';
const SUCCESS_WITH_WARNINGS: string = 'SUCCESS WITH WARNINGS';
const EXECUTING: string = 'EXECUTING';

/** The order in which status counts are listed in the summary: problems first. */
const STATUS_ORDER: ReadonlyArray<string> = [
  FAILURE,
  'BLOCKED',
  'ABORTED',
  SUCCESS_WITH_WARNINGS,
  'SUCCESS',
  'FROM CACHE',
  'SKIPPED',
  'NO OP'
];
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(STATUS_ORDER);

/** Which of an operation's commands produced its status: its initial command or its incremental command. */
export type AgentCommandKind = NonNullable<IDaemonOperationStatusChangedPayload['commandKind']>;

export interface IAgentOperationStatusUpdate {
  readonly operationId: string;
  readonly status: string;
  /** The operation's full log file, when the daemon reports one (failures and warnings). */
  readonly logFilePath?: string;
  /**
   * The command that produced the status, when the daemon reports it (failures and warnings of an operation
   * that has an incremental command).
   */
  readonly commandKind?: AgentCommandKind;
}

/** An operation's final status, as reported in the daemon's result. */
export interface IAgentOperationResult {
  readonly operationId: string;
  readonly status: string;
  readonly errorMessage?: string;
}

/** An operation that explains a failed request, with the excerpt and log file to print for it. */
export interface IAgentProblemOperation {
  readonly operationId: string;
  readonly logFilePath: string | undefined;
  readonly excerpt: OperationOutputExcerpt | undefined;
  /** The engine's error for the operation, when the daemon's result reported one. */
  readonly errorMessage: string | undefined;
  /** The command that failed or reported the warnings, when the daemon said which one it was. */
  readonly commandKind: AgentCommandKind | undefined;
}

/**
 * Tracks one request's operations for agent output: progress counters, running and failed operations,
 * and short output excerpts for the operations that can explain a failure.
 *
 * @remarks
 * Silent operations (for example phases that a project does not define) are registered but are not part of
 * the progress totals, matching the native `x of y` operation headers; only a silent failure is counted.
 * Counters follow status transitions, so an operation that is reset and runs again is counted once.
 * Output that belongs to no registered operation (a global command's byte stream) is kept as one excerpt.
 */
export class AgentOperationTracker {
  readonly #registered: Set<string> = new Set();
  readonly #silent: Set<string> = new Set();
  readonly #statuses: Map<string, string> = new Map();
  readonly #running: Set<string> = new Set();
  readonly #counts: Map<string, number> = new Map();
  readonly #failed: Set<string> = new Set();
  readonly #warned: Set<string> = new Set();
  readonly #excerpts: Map<string, OperationOutputExcerpt> = new Map();
  readonly #logFilePaths: Map<string, string> = new Map();
  readonly #commandKinds: Map<string, AgentCommandKind> = new Map();
  readonly #errorMessages: Map<string, string> = new Map();
  readonly #globalExcerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
  #headerTotal: number = 0;
  #done: number = 0;

  /** The number of non-silent operations that reached a terminal status. */
  public get done(): number {
    return this.#done;
  }

  /** The number of non-silent operations in the request, once known. */
  public get total(): number {
    return Math.max(this.#headerTotal, this.#registered.size);
  }

  /** Operations currently executing, oldest first. */
  public get running(): ReadonlyArray<string> {
    return [...this.#running];
  }

  /** Failed operations, in the order they failed. */
  public get failed(): ReadonlyArray<string> {
    return [...this.#failed];
  }

  /** Operations that succeeded with warnings, in the order they finished. */
  public get warned(): ReadonlyArray<string> {
    return [...this.#warned];
  }

  /** Whether any output arrived that belongs to no operation (for example a global command's output). */
  public get hasGlobalOutput(): boolean {
    return this.#globalExcerpt.lineCount > 0;
  }

  /** Whether the daemon announced any operation for the request, including silent ones. */
  public get hasOperations(): boolean {
    return this.#registered.size > 0 || this.#silent.size > 0;
  }

  public get globalExcerpt(): OperationOutputExcerpt {
    return this.#globalExcerpt;
  }

  /** Status counts in summary order, for example `[['FAILURE', 1], ['BLOCKED', 3]]`. */
  public getCounts(): ReadonlyArray<[string, number]> {
    return STATUS_ORDER.filter((status) => (this.#counts.get(status) ?? 0) > 0).map((status) => [
      status,
      this.#counts.get(status) ?? 0
    ]);
  }

  public register(operationId: string, silent: boolean): void {
    if (silent && !this.#registered.has(operationId)) {
      this.#silent.add(operationId);
    } else if (!silent) {
      this.#silent.delete(operationId);
      this.#registered.add(operationId);
    }
  }

  /** Records the engine's per-request operation total (from the operation header extension). */
  public setHeaderTotal(total: number): void {
    this.#headerTotal = Math.max(this.#headerTotal, total);
  }

  /** Applies a status change. */
  public updateStatus(update: IAgentOperationStatusUpdate): void {
    const { operationId, status } = update;
    if (this.#silent.has(operationId)) {
      if (status !== FAILURE) {
        return;
      }
      // Failed operations are reported even if silent, as in the native summary.
      this.register(operationId, false);
    }
    // An operation that was never registered still counts, so `done` never exceeds `total`.
    this.#registered.add(operationId);
    const previous: string | undefined = this.#statuses.get(operationId);
    this.#statuses.set(operationId, status);
    if (previous !== undefined && TERMINAL_STATUSES.has(previous)) {
      this.#done--;
      this.#counts.set(previous, (this.#counts.get(previous) ?? 1) - 1);
      this.#failed.delete(operationId);
      this.#warned.delete(operationId);
    }
    if (status === EXECUTING) {
      this.#running.add(operationId);
    } else {
      this.#running.delete(operationId);
    }
    if (TERMINAL_STATUSES.has(status)) {
      this.#onTerminalStatus(update);
    }
  }

  /**
   * Applies the daemon's final operation results to operations whose final status this client did not see,
   * for example an operation still executing when the daemon shut down, which the result reports as aborted.
   *
   * @remarks
   * The results also list silent operations without saying so, so an operation that no event announced is
   * only added when it failed.
   */
  public reconcile(results: ReadonlyArray<IAgentOperationResult>): void {
    for (const { operationId, status, errorMessage } of results) {
      const current: string | undefined = this.#statuses.get(operationId);
      const known: boolean = this.#registered.has(operationId) || this.#silent.has(operationId);
      if (
        TERMINAL_STATUSES.has(status) &&
        (known || status === FAILURE) &&
        (current === undefined || !TERMINAL_STATUSES.has(current))
      ) {
        this.updateStatus({ operationId, status });
      }
      if (errorMessage && this.#statuses.get(operationId) === FAILURE) {
        this.#errorMessages.set(operationId, errorMessage);
      }
    }
  }

  /**
   * Records output. An operation's output is discarded when it reaches a status without problems, but output
   * that follows is kept until its output stream closes: Rush writes an operation's build cache entry after its
   * status, and if that fails, it writes why and then changes the status to SUCCESS WITH WARNINGS.
   */
  public appendLog(operationId: string, text: string, stream: 'stdout' | 'stderr'): void {
    if (this.#silent.has(operationId)) {
      return;
    }
    const status: string | undefined = this.#statuses.get(operationId);
    if (status === undefined && !this.#registered.has(operationId)) {
      this.#globalExcerpt.append(text, stream);
      return;
    }
    let excerpt: OperationOutputExcerpt | undefined = this.#excerpts.get(operationId);
    if (!excerpt) {
      excerpt = new OperationOutputExcerpt();
      this.#excerpts.set(operationId, excerpt);
    }
    excerpt.append(text, stream);
  }

  /** Discards an operation's output when its output stream closes, unless its status is a problem. */
  public closeOutput(operationId: string): void {
    const status: string | undefined = this.#statuses.get(operationId);
    if (status !== undefined && TERMINAL_STATUSES.has(status) && !this.#isProblemStatus(status)) {
      this.#excerpts.delete(operationId);
    }
  }

  /**
   * The operations that explain a failed request: failed operations, or, when none failed, operations that
   * reported warnings (warnings fail a build unless the command allows them).
   */
  public getProblemOperations(): ReadonlyArray<IAgentProblemOperation> {
    const operationIds: ReadonlyArray<string> = this.#failed.size ? this.failed : this.warned;
    return operationIds.map((operationId) => this.getProblemOperation(operationId));
  }

  /** An operation's log file, output excerpt and error, to report it. */
  public getProblemOperation(operationId: string): IAgentProblemOperation {
    return {
      operationId,
      logFilePath: this.#logFilePaths.get(operationId),
      excerpt: this.#excerpts.get(operationId),
      errorMessage: this.#errorMessages.get(operationId),
      commandKind: this.#commandKinds.get(operationId)
    };
  }

  #isProblemStatus(status: string): boolean {
    return status === FAILURE || status === SUCCESS_WITH_WARNINGS;
  }

  #onTerminalStatus(update: IAgentOperationStatusUpdate): void {
    const { operationId, status, logFilePath, commandKind } = update;
    this.#done++;
    this.#counts.set(status, (this.#counts.get(status) ?? 0) + 1);
    if (!this.#isProblemStatus(status)) {
      // Output that follows starts a new excerpt; see appendLog.
      this.#excerpts.delete(operationId);
      return;
    }
    // Record unterminated last lines now, so a kept excerpt holds no partial-line buffer.
    this.#excerpts.get(operationId)?.flush();
    (status === FAILURE ? this.#failed : this.#warned).add(operationId);
    if (logFilePath) {
      this.#logFilePaths.set(operationId, logFilePath);
    }
    // An operation that runs again may run its other command, or report none.
    if (commandKind) {
      this.#commandKinds.set(operationId, commandKind);
    } else {
      this.#commandKinds.delete(operationId);
    }
  }
}
