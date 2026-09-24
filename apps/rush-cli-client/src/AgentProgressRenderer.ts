// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it before @microsoft/rush-lib
// so that the first line can be written within a few milliseconds.

import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'SUCCESS',
  'SUCCESS WITH WARNINGS',
  'SKIPPED',
  'FROM CACHE',
  'FAILURE',
  'BLOCKED',
  'NO OP',
  'ABORTED'
]);
const MAX_ERROR_LINES: number = 10;
const PIPE_MIN_INTERVAL_MS: number = 2000;
const PIPE_HEARTBEAT_MS: number = 10000;
const TTY_INTERVAL_MS: number = 100;

export interface IAgentProgressRendererOptions {
  readonly commandName: string;
  readonly isTTY: boolean;
  readonly columns: number;
  readonly write: (text: string) => void;
  readonly now?: () => number;
  readonly startTimeMs?: number;
}

interface IAgentFinalResult {
  readonly exitCode: number;
  readonly errorMessage?: string;
}

/**
 * Compact progress for agents on the daemon path: an immediate first line, at most
 * three live rows (TTY) or throttled append-only lines (pipes), and a guaranteed
 * bounded final summary line, even when no operation ran.
 */
export class AgentProgressRenderer {
  readonly #options: IAgentProgressRendererOptions;
  readonly #now: () => number;
  readonly #startTimeMs: number;
  readonly #registered: Set<string> = new Set();
  readonly #statuses: Map<string, string> = new Map();
  readonly #running: Set<string> = new Set();
  readonly #counts: Map<string, number> = new Map();
  readonly #failed: string[] = [];
  readonly #stderrTails: Map<string, string[]> = new Map();
  readonly #stdoutTails: Map<string, string[]> = new Map();
  #total: number = 0;
  #done: number = 0;
  #lastActivity: string = '';
  #phase: string = 'connecting to rushd (auto-starts if needed)';
  #painted: number = 0;
  #frame: number = 0;
  #lastLineKey: string = '';
  #lastLineAtMs: number = -Infinity;
  #timer: ReturnType<typeof setInterval> | undefined;
  #stopped: boolean = false;

  public constructor(options: IAgentProgressRendererOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#startTimeMs = options.startTimeMs ?? this.#now();
  }

  /** Writes the first line and starts the spinner / heartbeat. */
  public start(): void {
    this.#render(true);
    this.#timer = setInterval(
      () => this.#render(false),
      this.#options.isTTY ? TTY_INTERVAL_MS : PIPE_MIN_INTERVAL_MS
    );
    this.#timer.unref?.();
  }

  public setPhase(phase: string): void {
    if (phase === this.#phase) {
      return;
    }
    this.#phase = phase;
    this.#render(true);
  }

  public onQueuePosition(position: number): void {
    this.setPhase(`queued behind another request (position ${position})`);
  }

  public onEvent(event: IDaemonEventEnvelope): void {
    const payload: Record<string, unknown> = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'operationRegistered': {
        if (!payload.silent && typeof payload.operationId === 'string') {
          this.#registered.add(payload.operationId);
        }
        break;
      }
      case 'operationStatusChanged': {
        const operationId: unknown = payload.operationId;
        const status: unknown = payload.status;
        if (typeof operationId !== 'string' || typeof status !== 'string') {
          break;
        }
        this.#phase = 'running';
        const previous: string | undefined = this.#statuses.get(operationId);
        this.#statuses.set(operationId, status);
        if (status === 'EXECUTING') {
          this.#running.add(operationId);
        }
        if (TERMINAL_STATUSES.has(status) && (previous === undefined || !TERMINAL_STATUSES.has(previous))) {
          this.#running.delete(operationId);
          this.#done++;
          this.#counts.set(status, (this.#counts.get(status) ?? 0) + 1);
          if (status === 'FAILURE') {
            this.#failed.push(operationId);
          } else {
            this.#stdoutTails.delete(operationId);
            this.#stderrTails.delete(operationId);
          }
        }
        break;
      }
      case 'extension': {
        const data: { totalOperations?: unknown } | undefined = payload.data as
          | { totalOperations?: unknown }
          | undefined;
        if (data && typeof data.totalOperations === 'number') {
          this.#total = Math.max(this.#total, data.totalOperations);
        }
        break;
      }
      case 'activityChanged': {
        if (typeof payload.text === 'string' && payload.text.trim()) {
          this.#lastActivity = payload.text.trim().split('\n')[0];
          if (this.#phase !== 'running') {
            this.#phase = 'running';
          }
        }
        break;
      }
    }
    this.#render(false);
  }

  /**
   * Keeps bounded per-operation stderr and stdout tails (the last lines of each). They are only
   * printed for failed operations; stdout is used when an operation reported its diagnostics
   * there (tsc, eslint, jest) and wrote nothing to stderr.
   */
  public onLog(bytes: Uint8Array, operationId: string, stream: 'stdout' | 'stderr'): void {
    const status: string | undefined = this.#statuses.get(operationId);
    if (status !== undefined && TERMINAL_STATUSES.has(status) && status !== 'FAILURE') {
      return;
    }
    const tails: Map<string, string[]> = stream === 'stderr' ? this.#stderrTails : this.#stdoutTails;
    for (const line of Buffer.from(bytes).toString('utf8').split('\n')) {
      if (!line.trim()) {
        continue;
      }
      let tail: string[] | undefined = tails.get(operationId);
      if (!tail) {
        tail = [];
        tails.set(operationId, tail);
      }
      tail.push(line.trim());
      if (tail.length > MAX_ERROR_LINES) {
        tail.shift();
      }
    }
  }

  /** Stops rendering without a summary (e.g. the request is handed to in-process Rush). */
  public dispose(): void {
    this.#stop();
  }

  /** Stops the live region and writes the final summary line, at most once. */
  public finish(result: IAgentFinalResult | undefined): void {
    if (!this.#stop()) {
      return;
    }
    const succeeded: boolean = result !== undefined && result.exitCode === 0;
    const total: number = this.#getTotal();
    const parts: string[] = [...this.#counts].map(([status, count]) => `${count} ${status.toLowerCase()}`);
    const scope: string =
      total === 0 && succeeded
        ? 'up to date (no operations needed)'
        : `${this.#done}/${total} operations${parts.length ? ` (${parts.join(', ')})` : ''}`;
    let line: string = `rush ${this.#options.commandName}: ${succeeded ? 'SUCCESS' : 'FAILURE'} ${scope} in ${this.#elapsed()}`;
    if (this.#failed.length) {
      line += ` · failed: ${this.#failed.join(', ')}`;
    }
    if (result?.errorMessage) {
      line += ` · ${result.errorMessage}`;
    }
    this.#options.write(`${line}\n`);
    if (!succeeded) {
      for (const errorLine of this.#getFailureLines().slice(0, MAX_ERROR_LINES)) {
        this.#options.write(`  ${errorLine}\n`);
      }
    }
  }

  /** Failed operations' tails, or every operation's stderr tail when no operation failed. */
  #getFailureLines(): string[] {
    const operationIds: Iterable<string> = this.#failed.length ? this.#failed : this.#stderrTails.keys();
    const lines: string[] = [];
    for (const operationId of operationIds) {
      const tail: string[] = this.#stderrTails.get(operationId) ?? this.#stdoutTails.get(operationId) ?? [];
      for (const line of tail) {
        lines.push(`${operationId}: ${line}`);
      }
    }
    return lines;
  }

  /** Returns false if rendering had already stopped; after stopping, nothing more is written. */
  #stop(): boolean {
    if (this.#stopped) {
      return false;
    }
    this.#stopped = true;
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    this.#clear();
    return true;
  }

  #getTotal(): number {
    return Math.max(this.#total, this.#registered.size, this.#done);
  }

  #elapsed(): string {
    return `${((this.#now() - this.#startTimeMs) / 1000).toFixed(1)}s`;
  }

  #rows(): [string, string, string] {
    const total: number = this.#getTotal();
    const running: string[] = [...this.#running];
    const shown: string =
      running.slice(0, 3).join(', ') + (running.length > 3 ? ` +${running.length - 3} more` : '');
    const counter: string = total ? ` ${this.#done}/${total}` : '';
    return [
      `rush ${this.#options.commandName}${counter} · ${this.#elapsed()} · ${this.#phase}`,
      running.length ? `running: ${shown}` : '',
      this.#lastActivity
    ];
  }

  #render(force: boolean): void {
    if (this.#stopped) {
      return;
    }
    const rows: [string, string, string] = this.#rows();
    if (this.#options.isTTY) {
      const width: number = Math.max(20, this.#options.columns || 80) - 1;
      const clip = (row: string): string => (row.length > width ? `${row.slice(0, width - 1)}…` : row);
      const frame: string = SPINNER_FRAMES[this.#frame++ % SPINNER_FRAMES.length];
      const text: string = [`${frame} ${rows[0]}`, rows[1], rows[2]].map(clip).join('\n');
      this.#options.write(`${this.#painted ? `\x1b[${this.#painted}A\x1b[0J` : '\x1b[?25l'}${text}\n`);
      this.#painted = 3;
      return;
    }
    const key: string = `${this.#phase}|${this.#done}`;
    const nowMs: number = this.#now();
    const sinceLast: number = nowMs - this.#lastLineAtMs;
    if (!force && (sinceLast < PIPE_MIN_INTERVAL_MS || (key === this.#lastLineKey && sinceLast < PIPE_HEARTBEAT_MS))) {
      return;
    }
    this.#lastLineKey = key;
    this.#lastLineAtMs = nowMs;
    this.#options.write(`${rows[0]}${rows[1] ? ` · ${rows[1]}` : ''}\n`);
  }

  #clear(): void {
    if (this.#options.isTTY && this.#painted) {
      this.#options.write(`\x1b[${this.#painted}A\x1b[0J\x1b[?25h`);
      this.#painted = 0;
    }
  }
}
