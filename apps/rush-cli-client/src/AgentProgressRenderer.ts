// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it before @microsoft/rush-lib
// so that the first line can be written within a few milliseconds.

import type { DaemonRequestAdmissionErrorCode, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

import { AgentNotices } from './AgentNotices';
import {
  AgentOperationTracker,
  type IAgentOperationResult,
  type IAgentProblemOperation
} from './AgentOperationTracker';
import { clipLine } from './OperationOutputExcerpt';

const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** On a pipe, the most milestone lines written before the summary, however long the request runs. */
const MAX_PIPE_PROGRESS_LINES: number = 3;
/** On a pipe, how long the first line waits for the connection, so that a fast connect costs one line, not two. */
const PIPE_FIRST_LINE_DELAY_MS: number = 1000;
/**
 * On a pipe, a status line is written whenever nothing was written for this long, so that a reader can tell a slow
 * request from a hung one. Agent shells return partial output after 30 s. These lines are not milestones.
 */
const PIPE_STATUS_INTERVAL_MS: number = 25_000;
const SENT_PHASE: string = 'sent to rushd; preparing the workspace graph';
const STARTING_PHASE: string = 'rushd is still starting; waiting for it';
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
/**
 * Summary labels that differ from the native status name. A daemon reports an operation that is unchanged since
 * it last ran as `NO OP` (when no operation in the iteration had to run) or as `SKIPPED`; both mean up to date.
 */
const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ['SKIPPED', 'up to date'],
  ['NO OP', 'up to date']
]);

type PipeMilestone = 'starting' | 'sent' | 'queued' | 'running' | 'failure';
type Verdict = 'SUCCESS' | 'FAILURE' | 'CANCELLED';

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
  /** The daemon's final operation results, which may report statuses that no event carried. */
  readonly operationResults?: ReadonlyArray<IAgentOperationResult>;
  /** Why the daemon did not admit the request, if it did not. */
  readonly admissionErrorCode?: DaemonRequestAdmissionErrorCode;
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

/**
 * Compact progress for agents on the daemon path: an immediate first line, at most three live rows (TTY) or
 * at most three progress lines in total (pipes), and a guaranteed one-line summary, even when no
 * operation ran. On failure, the summary is preceded by each failed operation's log file and a short
 * excerpt of its output.
 *
 * @remarks
 * On a pipe, a line is written at a milestone: when the client waits for a daemon that is still starting, when the
 * request is sent to the daemon, the first time it waits for admission, the start of execution, and the first
 * failure; once three lines were written, later milestones are left to the summary. A connection that takes
 * longer than a second gets a line of its own first, unless a milestone came first. Whenever
 * nothing was written for 25 s, a status line with the counts and the running operations follows, so a reader
 * never sees more than 25 s of silence, and a request shorter than that costs no status lines at all.
 */
export class AgentProgressRenderer {
  readonly #options: IAgentProgressRendererOptions;
  readonly #now: () => number;
  readonly #startTimeMs: number;
  readonly #tracker: AgentOperationTracker = new AgentOperationTracker();
  readonly #milestones: Set<PipeMilestone> = new Set();
  readonly #notices: AgentNotices = new AgentNotices();
  #lastActivity: string = '';
  #phase: string = 'connecting to rushd (auto-starts if needed)';
  #painted: number = 0;
  #frame: number = 0;
  #pipeLines: number = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #firstLineTimer: ReturnType<typeof setTimeout> | undefined;
  #statusTimer: ReturnType<typeof setTimeout> | undefined;
  /** The last queue position and when it was reported, until operations start. */
  #queued: { readonly position: number; readonly elapsed: string } | undefined;
  #stopped: boolean = false;
  /** The error message that the summary line contains in full, once written. */
  #reportedErrorMessage: string | undefined;

  public constructor(options: IAgentProgressRendererOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#startTimeMs = options.startTimeMs ?? this.#now();
  }

  /**
   * On a TTY, paints the first line and starts the spinner. On a pipe, writes the first line after a second
   * unless another line came first, and starts the status lines.
   */
  public start(): void {
    if (!this.#options.isTTY) {
      this.#firstLineTimer = setTimeout(() => this.#writePipeLine(this.#rows()[0]), PIPE_FIRST_LINE_DELAY_MS);
      this.#firstLineTimer.unref?.();
      this.#scheduleStatusLine();
      return;
    }
    this.#paint();
    this.#timer = setInterval(() => this.#paint(), TTY_INTERVAL_MS);
    this.#timer.unref?.();
  }

  public setPhase(phase: string): void {
    if (phase === this.#phase) {
      return;
    }
    this.#phase = phase;
    if (this.#options.isTTY) {
      this.#paint();
    }
  }

  /**
   * The daemon is not ready yet, but a live process can still make it ready, so the client waits up to `waitMs`
   * more for it instead of running Rush in-process. On a pipe, says so once.
   */
  public onAwaitStartup(waitMs: number): void {
    this.setPhase(STARTING_PHASE);
    this.#writeMilestone('starting', ` (up to ${Math.round(waitMs / 1000)}s more)`);
  }

  /** The daemon has the request. On a pipe, says so, and that the next line can take a while. */
  public onRequestSent(): void {
    this.setPhase(SENT_PHASE);
    this.#writeMilestone('sent', ` (status at least every ${PIPE_STATUS_INTERVAL_MS / 1000}s)`);
  }

  public onQueuePosition(position: number): void {
    this.#queued = { position, elapsed: this.#elapsed() };
    this.setPhase(`queued behind another request (position ${position})`);
    this.#writeMilestone('queued');
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
        const data: { totalOperations?: unknown } | undefined = payload.data as
          | { totalOperations?: unknown }
          | undefined;
        if (data && typeof data.totalOperations === 'number') {
          this.#tracker.setHeaderTotal(data.totalOperations);
        }
        break;
      }
      case 'activityChanged': {
        this.#notices.add(payload, event.scope?.operationId);
        if (typeof payload.text === 'string' && payload.text.trim()) {
          this.#lastActivity = payload.text.trim().split('\n')[0];
          this.#phase = 'running';
          this.#queued = undefined;
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
    const { operationId, status, logFilePath } = payload;
    if (typeof operationId !== 'string' || typeof status !== 'string') {
      return;
    }
    const firstFailure: boolean = this.#tracker.updateStatus({
      operationId,
      status,
      logFilePath: typeof logFilePath === 'string' ? logFilePath : undefined
    });
    this.#phase = 'running';
    this.#queued = undefined;
    this.#writeMilestone('running');
    if (firstFailure) {
      this.#writeMilestone('failure', ` · first failure: ${operationId}`);
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
    const counts: string[] = [...countsByLabel].map(([label, count]) => `${count} ${label}`);
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
   * Each failed operation's log file and output excerpt. Without failed operations: operations with warnings
   * (they fail a build unless the command allows warnings), or else output that belongs to no operation. A
   * cancelled command reports only failed operations.
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
    const label: string = tracker.failed.length ? 'failed' : 'warnings';
    const lines: string[] = [];
    for (const [index, problem] of problems.slice(0, MAX_REPORTED_OPERATIONS).entries()) {
      const logFile: string = problem.logFilePath ? ` · full log: ${problem.logFilePath}` : '';
      lines.push(`${label}: ${problem.operationId}${logFile}`);
      const maxLines: number = index === 0 ? FIRST_OPERATION_EXCERPT_LINES : OTHER_OPERATION_EXCERPT_LINES;
      const excerpt: string[] = problem.excerpt?.getExcerpt(maxLines) ?? [];
      if (!excerpt.length && problem.errorMessage) {
        excerpt.push(clipLine(problem.errorMessage.trim().split('\n')[0], MAX_MESSAGE_LENGTH));
      }
      lines.push(...(excerpt.length ? excerpt : ['(no output)']).map((line) => `  ${line}`));
    }
    const hidden: number = problems.length - MAX_REPORTED_OPERATIONS;
    if (hidden > 0) {
      const what: string = label === 'failed' ? 'failed operations' : 'operations with warnings';
      lines.push(`+${hidden} more ${what}; their logs are in each project's rush-logs folder`);
    }
    return lines;
  }

  /** Returns false if rendering had already stopped; after stopping, nothing more is written. */
  #stop(): boolean {
    if (this.#stopped) {
      return false;
    }
    this.#stopped = true;
    for (const timer of [this.#firstLineTimer, this.#statusTimer]) {
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

  #writeMilestone(milestone: PipeMilestone, suffix: string = ''): void {
    if (this.#options.isTTY || this.#stopped || this.#milestones.has(milestone)) {
      return;
    }
    this.#milestones.add(milestone);
    this.#writePipeLine(`${this.#rows()[0]}${suffix}`);
  }

  #writePipeLine(line: string): void {
    if (this.#pipeLines < MAX_PIPE_PROGRESS_LINES) {
      this.#pipeLines++;
      this.#writeStatus(line);
    }
  }

  /** Writes a line on a pipe; the first line and the next status line are then due later. */
  #writeStatus(line: string): void {
    clearTimeout(this.#firstLineTimer);
    this.#firstLineTimer = undefined;
    this.#options.write(`${line}\n`);
    if (this.#statusTimer) {
      this.#scheduleStatusLine();
    }
  }

  #scheduleStatusLine(): void {
    clearTimeout(this.#statusTimer);
    this.#statusTimer = setTimeout(() => {
      if (!this.#stopped) {
        this.#writeStatus(this.#getStatusLine());
      }
    }, PIPE_STATUS_INTERVAL_MS);
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
