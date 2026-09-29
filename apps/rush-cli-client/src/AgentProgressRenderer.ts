// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it before @microsoft/rush-lib
// so that the first line can be written within a few milliseconds.

import type {
  DaemonRequestAdmissionErrorCode,
  IDaemonEventEnvelope,
  RUSHD_OPERATION_STREAM_CLOSED
} from '@rushstack/rush-daemon-protocol';

import { AgentNotices } from './AgentNotices';
import {
  type AgentCommandKind,
  AgentOperationTracker,
  type IAgentOperationResult,
  type IAgentProblemOperation
} from './AgentOperationTracker';
import { clipLine } from './OperationOutputExcerpt';

const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/**
 * On a pipe, the connecting line is written only when the connection takes longer than this. Like a status line,
 * it is never written in the first 10 s, so a connection that is fast, or a daemon that starts within that time,
 * costs no line.
 */
const PIPE_CONNECTING_LINE_DELAY_MS: number = 10_000;
/**
 * On a pipe, a status line is written whenever nothing was written for this long, so that a reader can tell a slow
 * request from a hung one. Agent shells return partial output after 30 s. A request that ends sooner writes none.
 */
const PIPE_STATUS_INTERVAL_MS: number = 25_000;
/**
 * On a pipe, a failed operation that wrote no output is reported only with the daemon's result, which carries its
 * error. Unless that result comes first, the next status line, which names it, is written this long after it failed.
 */
const PIPE_UNREPORTED_FAILURE_DELAY_MS: number = 1_000;
const SENT_PHASE: string = 'sent to rushd; preparing the workspace graph';
const STARTING_PHASE: string = 'rushd is still starting; waiting for it';
/** Ends the summary line of a cancelled request when the client stopped waiting before rushd confirmed the stop. */
const UNCONFIRMED_STOP: string = 'rushd did not confirm that the request stopped; it may still be stopping';
const FAILURE_STATUS: string = 'FAILURE';
/** The protocol's name for this extension event, repeated so that loading this module does not load the protocol. */
const OPERATION_STREAM_CLOSED: typeof RUSHD_OPERATION_STREAM_CLOSED = 'rushd.operation-stream-closed';
const TTY_INTERVAL_MS: number = 100;
/** The most failed (or warning) operations whose output excerpt is printed. */
const MAX_REPORTED_OPERATIONS: number = 3;
/** Excerpt lines for the first reported operation, which is most often the root cause. */
const FIRST_OPERATION_EXCERPT_LINES: number = 8;
const OTHER_OPERATION_EXCERPT_LINES: number = 3;
const GLOBAL_OUTPUT_EXCERPT_LINES: number = 8;
/** The most operation names listed in the summary line, and in a live row. */
const MAX_SUMMARY_NAMES: number = 5;
const MAX_LIVE_NAMES: number = 3;
const MAX_MESSAGE_LENGTH: number = 300;
/**
 * Lines of a multi-line error message printed after its first line: the first and last lines of the rest, since a
 * message that ends with the error after the diagnostics written before it can be thousands of lines long.
 */
const ERROR_DETAIL_HEAD_LINES: number = 2;
const ERROR_DETAIL_TAIL_LINES: number = 5;
const FAILED_LABEL: string = 'failed';
/**
 * Follows the name of an operation whose incremental command (`<phase>:incremental`) failed or reported the
 * warnings. That command can fail where the initial command would not, as in a build with `--no-daemon`. The daemon
 * forgets the last successful run of an operation that failed, so the operation's next run uses its initial command.
 */
const INCREMENTAL_COMMAND_NOTE: string = ' · incremental command';
const INCREMENTAL_COMMAND_FAILURE_NOTE: string = `${INCREMENTAL_COMMAND_NOTE}; its next run uses the initial command`;
/**
 * The error of an operation whose process exited with a nonzero code. It says nothing that the operation's output
 * does not, so it is printed only for an operation that wrote no output.
 */
const EXIT_CODE_ERROR_PATTERN: RegExp = /^Returned error code: \d+$/;
/** How much of an operation error's first line is looked for in the output shown for it, which clips long lines. */
const SHOWN_ERROR_KEY_LENGTH: number = 100;
const WHITESPACE_PATTERN: RegExp = /\s+/g;
/**
 * Summary labels that differ from the native status name. A daemon reports an operation that is unchanged since
 * it last ran as `NO OP` (when no operation in the iteration had to run) or as `SKIPPED`; both mean up to date.
 */
const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ['SKIPPED', 'up to date'],
  ['NO OP', 'up to date']
]);
/** The plural of a summary label, where it differs. */
const PLURAL_LABELS: ReadonlyMap<string, string> = new Map([['failure', 'failures']]);

type Verdict = 'SUCCESS' | 'FAILURE' | 'CANCELLED';

/**
 * Statuses that a failed result reports for operations that are still unfinished: a daemon that returns a failure
 * early lets the operations that the failure did not block run on.
 */
const UNFINISHED_STATUSES: ReadonlySet<string> = new Set(['WAITING', 'READY', 'QUEUED', 'EXECUTING']);

/** A queue position that the daemon reported, and when. */
interface IQueuePosition {
  readonly position: number;
  readonly elapsed: string;
}

export interface IAgentProgressRendererOptions {
  readonly commandName: string;
  readonly isTTY: boolean;
  readonly columns: number;
  readonly write: (text: string) => void;
  readonly now?: () => number;
  readonly startTimeMs?: number;
}

export interface IAgentFinalResult {
  readonly exitCode: number;
  readonly errorMessage?: string;
  /** Whether the command was cancelled (for example with Ctrl+C); reported as `CANCELLED`, not `FAILURE`. */
  readonly cancelled?: boolean;
  /**
   * For a cancelled command: the client stopped waiting before rushd confirmed that the request stopped, so it may
   * still be stopping.
   */
  readonly stopUnconfirmed?: boolean;
  /** The daemon's final operation results, which may report statuses that no event carried. */
  readonly operationResults?: ReadonlyArray<IAgentOperationResult>;
  /** Why the daemon did not admit the request, if it did not. */
  readonly admissionErrorCode?: DaemonRequestAdmissionErrorCode;
}

/** Says how many operations the daemon still runs after it reported the failure, if any. */
function formatUnfinishedOperations(results: ReadonlyArray<IAgentOperationResult> | undefined): string {
  const count: number = results?.filter(({ status }) => UNFINISHED_STATUSES.has(status)).length ?? 0;
  if (count === 0) {
    return '';
  }
  return ` · ${count} independent ${count === 1 ? 'operation continues' : 'operations continue'} in rushd`;
}

function formatNames(names: ReadonlyArray<string>, maxNames: number): string {
  const shown: string = names.slice(0, maxNames).join(', ');
  return names.length > maxNames ? `${shown} +${names.length - maxNames} more` : shown;
}

function getErrorDetail(lines: ReadonlyArray<string>): string[] {
  const omitted: number = lines.length - ERROR_DETAIL_HEAD_LINES - ERROR_DETAIL_TAIL_LINES;
  if (omitted <= 1) {
    return [...lines];
  }
  return [
    ...lines.slice(0, ERROR_DETAIL_HEAD_LINES),
    `… ${omitted} more lines …`,
    ...lines.slice(-ERROR_DETAIL_TAIL_LINES)
  ];
}

function getCommandKind(value: unknown): AgentCommandKind | undefined {
  return value === 'initial' || value === 'incremental' ? value : undefined;
}

/** What a reported operation's line says about the command that failed or reported the warnings. */
function getCommandNote(label: string, problem: IAgentProblemOperation): string {
  if (problem.commandKind !== 'incremental') {
    return '';
  }
  return label === FAILED_LABEL ? INCREMENTAL_COMMAND_FAILURE_NOTE : INCREMENTAL_COMMAND_NOTE;
}

function getMatchKey(line: string): string {
  return line.replace(WHITESPACE_PATTERN, ' ').trim().toLowerCase();
}

/**
 * The lines that report a failed operation's error from the daemon's result, given the lines already shown for
 * the operation: its first line, then its further lines as for a request's error. None when the lines shown
 * include the error's first line, or when the error only gives the exit code of a process that wrote output.
 */
function getOperationErrorLines(
  errorMessage: string | undefined,
  shownLines: ReadonlyArray<string>
): string[] {
  const [firstLine, ...detail] = (errorMessage ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (firstLine === undefined) {
    return [];
  }
  const message: string = firstLine.trim();
  const key: string = getMatchKey(message).slice(0, SHOWN_ERROR_KEY_LENGTH);
  if (
    (shownLines.length && EXIT_CODE_ERROR_PATTERN.test(message)) ||
    shownLines.some((line) => getMatchKey(line).includes(key))
  ) {
    return [];
  }
  return [message, ...getErrorDetail(detail)].map((line) => clipLine(line, MAX_MESSAGE_LENGTH));
}

/**
 * Compact progress for agents on the daemon path: at most three live rows (TTY) or one line when the request is
 * sent (pipes), each failed operation's log file and a short excerpt of its output as soon as it fails, and a
 * guaranteed one-line summary, even when no operation ran.
 *
 * @remarks
 * On a pipe, a request that takes less than 25 s writes the line that says it was sent, its failures and its
 * summary line, and nothing else. Status lines keep a longer request from looking hung: whenever nothing was
 * written for 25 s, a status line with the counts and the running operations follows, and a connection that
 * takes longer than 10 s gets one. A wait for a daemon that is still starting also gets a line, once, and so
 * does a cancellation, as soon as the client asks rushd to stop the request. Only the first three failed
 * operations are reported. Whether warnings fail the request is only known at its end, so operations with
 * warnings are reported before the summary line; so is a failed operation that wrote no output, whose error
 * only the daemon's result carries. On a pipe, the next status line, which names that operation, is then due
 * 1 s after it failed, so that a result that the daemon returns early can come first and make it moot. An error
 * that the output shown for a reported operation leaves out, for example one thrown while its build cache entry
 * was restored, is written before the summary line too, as `error: <operation>` and the error.
 */
export class AgentProgressRenderer {
  readonly #options: IAgentProgressRendererOptions;
  readonly #now: () => number;
  readonly #startTimeMs: number;
  readonly #tracker: AgentOperationTracker = new AgentOperationTracker();
  readonly #notices: AgentNotices = new AgentNotices();
  /** The operations whose log file and excerpt were written, in that order, with the output lines shown for each. */
  readonly #reported: Map<string, ReadonlyArray<string>> = new Map();
  #lastActivity: string = '';
  #phase: string = 'connecting to rushd (auto-starts if needed)';
  #painted: number = 0;
  #frame: number = 0;
  #startingLineWritten: boolean = false;
  #sentLineWritten: boolean = false;
  #started: boolean = false;
  #timer: ReturnType<typeof setInterval> | undefined;
  #connectingTimer: ReturnType<typeof setTimeout> | undefined;
  #statusTimer: ReturnType<typeof setTimeout> | undefined;
  /** The last queue position, until operations start. */
  #queued: IQueuePosition | undefined;
  /** The first queue position, for the summary line. */
  #firstQueued: IQueuePosition | undefined;
  #stopped: boolean = false;
  /** The client asked rushd to cancel the request; the progress line says so until the end. */
  #cancelling: boolean = false;
  /** On a pipe: an operation that wrote no output failed, and no line has named it yet. */
  #unnamedFailure: boolean = false;
  /** The error message that the summary line contains in full, once written. */
  #reportedErrorMessage: string | undefined;

  public constructor(options: IAgentProgressRendererOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#startTimeMs = options.startTimeMs ?? this.#now();
  }

  /**
   * On a TTY, paints the first line and starts the spinner. On a pipe, starts the status lines, and writes the
   * connecting line after 10 s unless the request was sent by then. Does nothing if rendering already started or
   * stopped.
   */
  public start(): void {
    if (this.#started || this.#stopped) {
      return;
    }
    this.#started = true;
    if (!this.#options.isTTY) {
      this.#connectingTimer = setTimeout(
        () => this.#writePipeLine(this.#rows()[0]),
        PIPE_CONNECTING_LINE_DELAY_MS
      );
      this.#connectingTimer.unref?.();
      this.#scheduleStatusLine();
      return;
    }
    this.#paint();
    this.#timer = setInterval(() => this.#paint(), TTY_INTERVAL_MS);
    this.#timer.unref?.();
  }

  public setPhase(phase: string): void {
    if (phase === this.#phase || this.#cancelling) {
      return;
    }
    this.#phase = phase;
    if (this.#options.isTTY) {
      this.#paint();
    }
  }

  /**
   * The daemon is not ready yet, but a live process can still make it ready, so the client waits up to `waitMs`
   * more for it instead of running Rush in-process. On a pipe, says so once, with `owner`, the sentence that
   * describes that process, for example "Its startup helper (PID 123) is still waiting for the daemon"; the
   * connecting line is then not due.
   */
  public onAwaitStartup(waitMs: number, owner?: string): void {
    this.setPhase(STARTING_PHASE);
    clearTimeout(this.#connectingTimer);
    this.#connectingTimer = undefined;
    if (!this.#options.isTTY && !this.#stopped && !this.#startingLineWritten) {
      this.#startingLineWritten = true;
      const reason: string = owner ? ` because ${owner.charAt(0).toLowerCase()}${owner.slice(1)}` : '';
      this.#writePipeLine(`${this.#rows()[0]} (up to ${Math.round(waitMs / 1000)}s more)${reason}`);
    }
  }

  /** The daemon has the request. On a pipe, says so once, and that the next line can take a while. */
  public onRequestSent(): void {
    this.setPhase(SENT_PHASE);
    clearTimeout(this.#connectingTimer);
    this.#connectingTimer = undefined;
    if (!this.#options.isTTY && !this.#stopped && !this.#sentLineWritten) {
      this.#sentLineWritten = true;
      this.#writePipeLine(`${this.#rows()[0]} (status at least every ${PIPE_STATUS_INTERVAL_MS / 1000}s)`);
    }
  }

  /**
   * Writes one line. On a TTY, the live rows are redrawn below it; on a pipe, the next status line is then due 25 s
   * later.
   */
  public note(line: string): void {
    if (this.#stopped) {
      return;
    }
    if (this.#options.isTTY) {
      this.#clear();
      this.#options.write(`${line}\n`);
      this.#paint();
    } else {
      this.#writePipeLine(line);
    }
  }

  /** The request waits for admission. The status lines and the summary line say so. */
  public onQueuePosition(position: number): void {
    this.#queued = { position, elapsed: this.#elapsed() };
    this.#firstQueued ??= this.#queued;
    this.setPhase(`queued behind another request (position ${position})`);
  }

  /**
   * The request waits for a daemon restart, and `wait` says why and for what. The phase and the status lines say
   * that instead of a queue position. On a pipe, `announce` writes a status line at once, so that the wait and its
   * cause are known when the wait begins or its cause changes, rather than at the next status line. Once the client
   * asked rushd to cancel the request, the cancelling phase stays, and nothing is written. Returns whether it wrote
   * a line.
   */
  public onRestartWait(wait: string, announce: boolean): boolean {
    if (this.#cancelling) {
      return false;
    }
    this.#queued = undefined;
    this.setPhase(wait);
    if (!announce || this.#options.isTTY || this.#stopped) {
      return false;
    }
    this.#writePipeLine(this.#getStatusLine());
    return true;
  }

  /**
   * The client asked rushd to cancel the request, and waits up to `timeoutMs` for rushd to stop it, which can take
   * seconds while rushd prepares the workspace graph. Says so at once, and on a TTY until the end; on a pipe, in one
   * line.
   */
  public onCancelRequested(timeoutMs: number): void {
    if (this.#cancelling) {
      return;
    }
    this.setPhase(`cancelling; waiting up to ${Math.round(timeoutMs / 1000)}s for rushd to stop the request`);
    this.#cancelling = true;
    if (!this.#options.isTTY) {
      this.#writePipeLine(this.#rows()[0]);
    }
  }

  public onEvent(event: IDaemonEventEnvelope): void {
    if (this.#stopped) {
      return;
    }
    const payload: Record<string, unknown> = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'operationRegistered': {
        if (typeof payload.operationId === 'string') {
          this.#tracker.register(payload.operationId, !!payload.silent);
        }
        break;
      }
      case 'operationStatusChanged': {
        this.#onStatusChanged(payload);
        break;
      }
      case 'extension': {
        const data: { totalOperations?: unknown; operationId?: unknown } | undefined = payload.data as
          | { totalOperations?: unknown; operationId?: unknown }
          | undefined;
        if (data && typeof data.totalOperations === 'number') {
          this.#tracker.setHeaderTotal(data.totalOperations);
        } else if (payload.name === OPERATION_STREAM_CLOSED && typeof data?.operationId === 'string') {
          this.#tracker.closeOutput(data.operationId);
        }
        break;
      }
      case 'activityChanged': {
        this.#notices.add(payload, event.scope?.operationId);
        if (typeof payload.text === 'string' && payload.text.trim()) {
          this.#lastActivity = payload.text.trim().split('\n')[0];
          this.#onRunning();
        }
        break;
      }
    }
  }

  /**
   * Keeps short excerpts of operation output. They are only printed for operations that explain a failed
   * request (failed operations, or operations with warnings when warnings failed the request).
   */
  public onLog(bytes: Uint8Array, operationId: string, stream: 'stdout' | 'stderr'): void {
    this.#tracker.appendLog(operationId, Buffer.from(bytes).toString('utf8'), stream);
  }

  /** Stops rendering without a summary (e.g. the request is handed to in-process Rush). */
  public dispose(): void {
    this.#stop();
  }

  /**
   * Stops the live region and writes the failure report (on failure) and the final summary line, at most once.
   * Warnings and errors that Rush or a plugin wrote outside any operation precede them. The summary line carries
   * the first line of the error message; the further lines of a multi-line message precede it, at most eight,
   * with the middle ones elided. Returns true when the error message was reported, now or by an earlier call, so
   * callers need not repeat it: only a single line too long for the summary line is not, unless it gives the
   * reason for an admission failure, which is never clipped.
   */
  public finish(result: IAgentFinalResult | undefined): boolean {
    const errorMessage: string | undefined = result?.errorMessage?.trim();
    if (!this.#stop()) {
      return errorMessage !== undefined && errorMessage === this.#reportedErrorMessage;
    }
    for (const notice of this.#notices.getLines()) {
      this.#options.write(`${notice}\n`);
    }
    if (result?.operationResults) {
      this.#tracker.reconcile(result.operationResults);
    }
    const verdict: Verdict = result?.cancelled
      ? 'CANCELLED'
      : result !== undefined && result.exitCode === 0
        ? 'SUCCESS'
        : 'FAILURE';
    const lines: string[] = verdict === 'SUCCESS' ? [] : this.#getFailureReport(verdict);
    // A phased result without operations, for which the daemon announced none, had an empty selection.
    const emptySelection: boolean =
      verdict === 'SUCCESS' && result?.operationResults?.length === 0 && !this.#tracker.hasOperations;
    let summary: string = this.#getSummaryLine(verdict, emptySelection);
    if (verdict === 'FAILURE') {
      summary += formatUnfinishedOperations(result?.operationResults);
    } else if (verdict === 'CANCELLED' && result?.stopUnconfirmed) {
      summary += ` · ${UNCONFIRMED_STOP}`;
    }
    // An admission failure says that the request waited, and why it stopped waiting.
    if (this.#firstQueued && !result?.admissionErrorCode) {
      const { position, elapsed } = this.#firstQueued;
      summary += ` · queued behind another request (position ${position} at ${elapsed})`;
    }
    if (errorMessage) {
      const [firstLine, ...detail] = errorMessage.split('\n').filter((line) => line.trim());
      const admissionErrorCode: string | undefined =
        verdict === 'FAILURE' &&
        (result?.admissionErrorCode === 'no-wait' || result?.admissionErrorCode === 'wait-timeout')
          ? result.admissionErrorCode
          : undefined;
      // Keep the string that legacy output prints for a busy workspace, which guidance tells agents to look for.
      const prefix: string = admissionErrorCode ? `daemon admission failed (${admissionErrorCode}): ` : '';
      // The daemon's reason for an admission failure says what the request waited for and what to do instead, and
      // the caller has no better text for it, so it is never clipped.
      const summaryMessage: string = admissionErrorCode ? firstLine : clipLine(firstLine, MAX_MESSAGE_LENGTH);
      summary += ` · ${prefix}${summaryMessage}`;
      if (detail.length) {
        lines.push(...getErrorDetail(detail).map((line) => `  ${clipLine(line, MAX_MESSAGE_LENGTH)}`));
      }
      if (detail.length || summaryMessage === firstLine) {
        this.#reportedErrorMessage = errorMessage;
      }
    }
    lines.push(summary);
    this.#options.write(lines.map((line) => `${line}\n`).join(''));
    return this.#reportedErrorMessage !== undefined;
  }

  #onStatusChanged(payload: Record<string, unknown>): void {
    const { operationId, status, logFilePath, commandKind } = payload;
    if (typeof operationId !== 'string' || typeof status !== 'string') {
      return;
    }
    this.#tracker.updateStatus({
      operationId,
      status,
      logFilePath: typeof logFilePath === 'string' ? logFilePath : undefined,
      commandKind: getCommandKind(commandKind)
    });
    this.#onRunning();
    if (status === FAILURE_STATUS) {
      this.#reportFailure(operationId);
    }
  }

  /** The request runs, so it no longer waits in a queue. The phase says so, unless the request is being cancelled. */
  #onRunning(): void {
    if (!this.#cancelling) {
      this.#phase = 'running';
    }
    this.#queued = undefined;
  }

  /**
   * Writes a failed operation's log file and output excerpt as soon as it fails, while the rest of the request
   * runs on. The operation's output all arrived before its status. An operation that wrote nothing is left to
   * the failure report, which has the error from the daemon's result; on a pipe, the next status line names it
   * sooner. The error of an operation reported here follows with the failure report, if the excerpt lacks it.
   */
  #reportFailure(operationId: string): void {
    if (this.#stopped || this.#reported.has(operationId) || this.#reported.size >= MAX_REPORTED_OPERATIONS) {
      return;
    }
    const problem: IAgentProblemOperation = this.#tracker.getProblemOperation(operationId);
    if (!problem.excerpt?.lineCount) {
      if (this.#statusTimer && !this.#unnamedFailure) {
        this.#unnamedFailure = true;
        this.#scheduleStatusLine();
      }
      return;
    }
    const lines: string[] = this.#getProblemLines(FAILED_LABEL, problem);
    const text: string = lines.map((line) => `${line}\n`).join('');
    if (this.#options.isTTY) {
      this.#clear();
      this.#options.write(text);
      this.#paint();
    } else {
      this.#writePipeText(text);
    }
  }

  #getSummaryLine(verdict: Verdict, emptySelection: boolean): string {
    const tracker: AgentOperationTracker = this.#tracker;
    const { total, done } = tracker;
    const countsByLabel: Map<string, number> = new Map();
    for (const [status, count] of tracker.getCounts()) {
      const label: string = STATUS_LABELS.get(status) ?? status.toLowerCase();
      countsByLabel.set(label, (countsByLabel.get(label) ?? 0) + count);
    }
    const counts: string[] = [...countsByLabel].map(
      ([label, count]) => `${count} ${(count !== 1 && PLURAL_LABELS.get(label)) || label}`
    );
    const matchedNothing: boolean = total === 0 && done === 0 && emptySelection && !tracker.hasGlobalOutput;
    let scope: string = '';
    if (total > 0 || done > 0) {
      scope = ` ${done}/${total} operations${counts.length ? ` (${counts.join(', ')})` : ''}`;
    } else if (matchedNothing) {
      scope = ' 0 operations';
    } else if (verdict === 'SUCCESS' && !tracker.hasGlobalOutput) {
      scope = ' up to date (no operations needed)';
    }
    let line: string = `rush ${this.#options.commandName}: ${verdict}${scope} in ${this.#elapsed()}`;
    if (tracker.failed.length) {
      line += ` · failed: ${formatNames(tracker.failed, MAX_SUMMARY_NAMES)}`;
    } else if (verdict === 'FAILURE' && tracker.warned.length) {
      line += ` · warnings: ${formatNames(tracker.warned, MAX_SUMMARY_NAMES)}`;
    } else if (matchedNothing) {
      // Worded like native Rush's "The command line selection parameters did not match any projects."
      line += ' · the selection parameters did not match any projects';
    }
    return line;
  }

  /**
   * The log file and output excerpt of each failed operation not yet reported. Without failed operations:
   * operations with warnings (they fail a build unless the command allows warnings), or else output that belongs
   * to no operation. A cancelled command reports only failed operations. At most three operations are reported
   * in all, with the operations reported as they failed. The daemon's result carries the error of each failed
   * operation, so an operation reported as it failed gets its error here, unless the output shown for it had it.
   */
  #getFailureReport(verdict: Verdict): string[] {
    const tracker: AgentOperationTracker = this.#tracker;
    if (verdict === 'CANCELLED' && !tracker.failed.length) {
      return [];
    }
    const problems: ReadonlyArray<IAgentProblemOperation> = tracker.getProblemOperations();
    if (!problems.length) {
      return tracker.globalExcerpt.getExcerpt(GLOBAL_OUTPUT_EXCERPT_LINES).map((line) => `  ${line}`);
    }
    const label: string = tracker.failed.length ? FAILED_LABEL : 'warnings';
    const lines: string[] = [];
    let hidden: number = 0;
    for (const problem of problems) {
      const shownLines: ReadonlyArray<string> | undefined = this.#reported.get(problem.operationId);
      if (shownLines) {
        const errorLines: string[] = getOperationErrorLines(problem.errorMessage, shownLines);
        if (errorLines.length) {
          lines.push(`error: ${problem.operationId}`, ...errorLines.map((line) => `  ${line}`));
        }
        continue;
      }
      if (this.#reported.size < MAX_REPORTED_OPERATIONS) {
        lines.push(...this.#getProblemLines(label, problem));
      } else {
        hidden++;
      }
    }
    if (hidden > 0) {
      const what: string = label === FAILED_LABEL ? 'failed operations' : 'operations with warnings';
      lines.push(`+${hidden} more ${what}; their logs are in each project's rush-logs folder`);
    }
    return lines;
  }

  /**
   * An operation's report: its log file, then its output excerpt, which is longer for the first reported
   * operation (most often the root cause), then its error from the daemon's result, if known and not shown
   * already. Records that the operation was reported, and the lines shown for it.
   */
  #getProblemLines(label: string, problem: IAgentProblemOperation): string[] {
    const maxLines: number = this.#reported.size
      ? OTHER_OPERATION_EXCERPT_LINES
      : FIRST_OPERATION_EXCERPT_LINES;
    const excerpt: string[] = problem.excerpt?.getExcerpt(maxLines) ?? [];
    const shownLines: string[] = [...excerpt, ...getOperationErrorLines(problem.errorMessage, excerpt)];
    this.#reported.set(problem.operationId, shownLines);
    const logFile: string = problem.logFilePath ? ` · full log: ${problem.logFilePath}` : '';
    return [
      `${label}: ${problem.operationId}${getCommandNote(label, problem)}${logFile}`,
      ...(shownLines.length ? shownLines : ['(no output)']).map((line) => `  ${line}`)
    ];
  }

  /** Returns false if rendering had already stopped; after stopping, nothing more is written. */
  #stop(): boolean {
    if (this.#stopped) {
      return false;
    }
    this.#stopped = true;
    for (const timer of [this.#connectingTimer, this.#statusTimer]) {
      clearTimeout(timer);
    }
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#clear();
    return true;
  }

  #elapsed(): string {
    return `${((this.#now() - this.#startTimeMs) / 1000).toFixed(1)}s`;
  }

  #rows(): [string, string, string] {
    const { total, done, running, failed } = this.#tracker;
    const counter: string = total ? ` ${done}/${total}` : '';
    return [
      `rush ${this.#options.commandName}${counter} · ${this.#elapsed()} · ${this.#phase}`,
      running.length ? `running: ${formatNames(running, MAX_LIVE_NAMES)}` : '',
      failed.length ? `failed: ${formatNames(failed, MAX_LIVE_NAMES)}` : this.#lastActivity
    ];
  }

  #writePipeLine(line: string): void {
    if (!this.#stopped) {
      this.#writePipeText(`${line}\n`);
    }
  }

  /** Writes to a pipe; the next status line is then due 25 s later. */
  #writePipeText(text: string): void {
    this.#options.write(text);
    if (this.#statusTimer) {
      this.#scheduleStatusLine();
    }
  }

  #scheduleStatusLine(): void {
    clearTimeout(this.#statusTimer);
    this.#statusTimer = setTimeout(
      () => {
        this.#unnamedFailure = false;
        this.#writePipeLine(this.#getStatusLine());
      },
      this.#unnamedFailure ? PIPE_UNREPORTED_FAILURE_DELAY_MS : PIPE_STATUS_INTERVAL_MS
    );
    this.#statusTimer.unref?.();
  }

  /**
   * A pipe status line: the counts, then the running operations, or else what the request waits for. The daemon
   * does not report admission, so after a queue position this says when the position was reported instead of
   * claiming that the request is still queued.
   */
  #getStatusLine(): string {
    const { total, done, running, failed } = this.#tracker;
    let activity: string = this.#phase;
    if (running.length) {
      activity = `running: ${formatNames(running, MAX_LIVE_NAMES)}`;
    } else if (this.#queued) {
      activity =
        `waiting for admission or the workspace graph ` +
        `(queue position ${this.#queued.position} at ${this.#queued.elapsed})`;
    }
    const failures: string = failed.length ? ` · failed: ${formatNames(failed, MAX_LIVE_NAMES)}` : '';
    const counter: string = total ? ` ${done}/${total}` : '';
    return `rush ${this.#options.commandName}${counter} · ${this.#elapsed()} · ${activity}${failures}`;
  }

  #paint(): void {
    if (this.#stopped) {
      return;
    }
    const rows: [string, string, string] = this.#rows();
    const width: number = Math.max(20, this.#options.columns || 80) - 1;
    const clip = (row: string): string => (row.length > width ? `${row.slice(0, width - 1)}…` : row);
    const frame: string = SPINNER_FRAMES[this.#frame++ % SPINNER_FRAMES.length];
    const text: string = [`${frame} ${rows[0]}`, rows[1], rows[2]].map(clip).join('\n');
    this.#options.write(`${this.#painted ? `\x1b[${this.#painted}A\x1b[0J` : '\x1b[?25l'}${text}\n`);
    this.#painted = 3;
  }

  #clear(): void {
    if (this.#options.isTTY && this.#painted) {
      this.#options.write(`\x1b[${this.#painted}A\x1b[0J\x1b[?25h`);
      this.#painted = 0;
    }
  }
}
