// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import {
  SPINNER_FRAMES,
  MIN_REFRESH_INTERVAL_MS,
  createColorizer,
  renderLiveRegion,
  resolveColorEnabled,
  shouldRefresh,
  type IColorizer,
  type ILiveRegionState
} from './InteractiveRendering';

const HIDE_CURSOR: string = '\u001b[?25l';
const SHOW_CURSOR: string = '\u001b[?25h';
const MAX_FINAL_DIAGNOSTICS: number = 10;
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'success',
  'successWithWarnings',
  'failure',
  'blocked',
  'skipped',
  'fromCache',
  'noOp'
]);

/**
 * The terminal an interactive reporter writes to.
 *
 * @beta
 */
export interface IInteractiveTerminal {
  /**
   * The terminal width in columns.
   */
  readonly columns: number;

  /**
   * Whether the terminal is an interactive TTY.
   */
  readonly isTTY: boolean;

  /**
   * Writes text to the terminal.
   */
  write(text: string): void;
}

/**
 * Options for {@link DefaultInteractiveReporter}.
 *
 * @beta
 */
export interface IDefaultInteractiveReporterOptions {
  /**
   * The terminal to render to.
   */
  readonly terminal: IInteractiveTerminal;

  /**
   * Whether color is enabled. Defaults to the terminal TTY capability.
   */
  readonly color?: boolean;

  /**
   * Environment variables used to resolve `NO_COLOR` and `FORCE_COLOR`.
   * Defaults to `process.env`.
   */
  readonly env?: Record<string, string | undefined>;

  /**
   * Returns the current time in milliseconds. Injectable for testing.
   */
  readonly nowMs?: () => number;

  /**
   * The minimum refresh interval in milliseconds. Defaults to 100 ms.
   */
  readonly minRefreshIntervalMs?: number;

  /**
   * The full-detail log path shown on failure.
   */
  readonly logPath?: string;
}

/**
 * The concise default reporter that renders a three-row interactive live region.
 *
 * @remarks
 * The live region shows aggregate progress with a spinner, width-aware active
 * projects with `+N more`, and the latest activity. It refreshes at no more than
 * 10 Hz, reacts to terminal width, restores the cursor on completion, leaves at
 * most three stable lines on success, appends a bounded diagnostic block and log
 * path on failure, and in watch mode keeps the live region while appending one
 * summary per completed cycle.
 *
 * @beta
 */
export class DefaultInteractiveReporter implements IReporter {
  public readonly name: string = 'default';

  readonly #terminal: IInteractiveTerminal;
  readonly #color: IColorizer;
  readonly #colorEnabled: boolean;
  readonly #nowMs: () => number;
  readonly #minRefreshIntervalMs: number;

  #commandName: string | undefined;
  #totalOperations: number;
  #completedOperations: number;
  #failedOperations: number;
  readonly #projectByOperation: Map<string, string>;
  readonly #activeProjects: Map<string, string>;
  #latestActivity: string;
  readonly #diagnostics: string[];
  #result: { succeeded: boolean; exitCode: number } | undefined;
  #logPath: string | undefined;

  #spinnerIndex: number;
  #lastPaintMs: number;
  #paintedRowCount: number;
  #cursorHidden: boolean;
  #finalized: boolean;

  public constructor(options: IDefaultInteractiveReporterOptions) {
    this.#terminal = options.terminal;
    this.#colorEnabled =
      options.color ?? resolveColorEnabled(options.env ?? process.env, options.terminal.isTTY);
    this.#color = createColorizer(this.#colorEnabled);
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#minRefreshIntervalMs = options.minRefreshIntervalMs ?? MIN_REFRESH_INTERVAL_MS;

    this.#commandName = undefined;
    this.#totalOperations = 0;
    this.#completedOperations = 0;
    this.#failedOperations = 0;
    this.#projectByOperation = new Map();
    this.#activeProjects = new Map();
    this.#latestActivity = '';
    this.#diagnostics = [];
    this.#result = undefined;
    this.#logPath = options.logPath;

    this.#spinnerIndex = 0;
    this.#lastPaintMs = Number.NEGATIVE_INFINITY;
    this.#paintedRowCount = 0;
    this.#cursorHidden = false;
    this.#finalized = false;
  }

  public async initializeAsync(): Promise<void> {
    /* The cursor is hidden lazily on the first paint. */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.#update(event);
    if (event.type === 'watchCycleCompleted') {
      this.#appendWatchSummary(event);
      return;
    }
    if (this.#terminal.isTTY && shouldRefresh(this.#lastPaintMs, this.#nowMs(), this.#minRefreshIntervalMs)) {
      this.#paint();
    }
  }

  public async flushAsync(): Promise<void> {
    if (this.#terminal.isTTY && !this.#finalized) {
      this.#paint();
    }
  }

  public async closeAsync(): Promise<void> {
    this.#finalize();
  }

  #update(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName?: string }).commandName;
        break;
      }
      case 'operationRegistered': {
        const payload: { operationId: string; projectName?: string } = event.payload as {
          operationId: string;
          projectName?: string;
        };
        this.#totalOperations++;
        this.#projectByOperation.set(
          payload.operationId,
          payload.projectName ?? event.scope?.projectName ?? payload.operationId
        );
        break;
      }
      case 'operationStatusChanged': {
        const payload: { operationId: string; status: string; projectName?: string } = event.payload as {
          operationId: string;
          status: string;
          projectName?: string;
        };
        const projectName: string =
          payload.projectName ??
          event.scope?.projectName ??
          this.#projectByOperation.get(payload.operationId) ??
          payload.operationId;
        if (payload.status === 'executing') {
          this.#activeProjects.set(payload.operationId, projectName);
        } else if (TERMINAL_STATUSES.has(payload.status)) {
          this.#activeProjects.delete(payload.operationId);
          this.#completedOperations++;
          if (payload.status === 'failure') {
            this.#failedOperations++;
          }
        }
        this.#latestActivity = `${payload.status} ${projectName}`;
        break;
      }
      case 'activityChanged': {
        const payload: { kind?: string; text?: string } = event.payload as { kind?: string; text?: string };
        if (payload.text !== undefined) {
          this.#latestActivity = payload.text;
        }
        break;
      }
      case 'diagnosticEmitted': {
        const payload: { code?: string; severity?: string } = event.payload as {
          code?: string;
          severity?: string;
        };
        if (payload.severity === 'error' || payload.severity === 'warning') {
          this.#diagnostics.push(`[${payload.severity}] ${payload.code ?? 'unknown'}`);
        }
        break;
      }
      case 'artifactAvailable': {
        const payload: { role?: string; path?: string } = event.payload as { role?: string; path?: string };
        if (payload.role === 'log' && payload.path !== undefined) {
          this.#logPath = payload.path;
        }
        break;
      }
      case 'commandResult': {
        this.#result = event.payload as { succeeded: boolean; exitCode: number };
        break;
      }
      default:
        break;
    }
  }

  #snapshot(): ILiveRegionState {
    return {
      commandName: this.#commandName,
      totalOperations: this.#totalOperations,
      completedOperations: this.#completedOperations,
      failedOperations: this.#failedOperations,
      activeProjects: [...this.#activeProjects.values()],
      latestActivity: this.#latestActivity
    };
  }

  #paint(): void {
    if (!this.#cursorHidden) {
      this.#terminal.write(HIDE_CURSOR);
      this.#cursorHidden = true;
    }
    const spinnerFrame: string = SPINNER_FRAMES[this.#spinnerIndex % SPINNER_FRAMES.length];
    this.#spinnerIndex++;
    const rows: string[] = renderLiveRegion(this.#snapshot(), {
      width: this.#terminal.columns,
      spinnerFrame,
      color: this.#color
    });
    this.#terminal.write(`${this.#clearRegion()}${rows.join('\n')}\n`);
    this.#paintedRowCount = rows.length;
    this.#lastPaintMs = this.#nowMs();
  }

  #clearRegion(): string {
    if (this.#paintedRowCount === 0) {
      return '';
    }
    return `\u001b[${this.#paintedRowCount}A\u001b[0J`;
  }

  #appendWatchSummary(event: IReporterEventEnvelope<unknown>): void {
    const payload: { succeeded?: boolean } = event.payload as { succeeded?: boolean };
    const marker: string = payload.succeeded ? this.#color.green('✔') : this.#color.red('✖');
    const summary: string = `${marker} watch cycle ${payload.succeeded ? 'succeeded' : 'failed'}`;
    this.#terminal.write(`${this.#clearRegion()}${summary}\n`);
    this.#paintedRowCount = 0;
    if (this.#terminal.isTTY) {
      this.#paint();
    }
  }

  #finalize(): void {
    if (this.#finalized) {
      return;
    }
    this.#finalized = true;

    const lines: string[] = [];
    const succeeded: boolean = this.#result?.succeeded ?? false;
    if (succeeded) {
      lines.push(
        `${this.#color.green('✔')} ${this.#commandName ?? 'rush'} succeeded — ` +
          `${this.#completedOperations}/${this.#totalOperations} operations`
      );
    } else {
      lines.push(
        `${this.#color.red('✖')} ${this.#commandName ?? 'rush'} failed — ${this.#failedOperations} failed`
      );
      for (const diagnostic of this.#diagnostics.slice(0, MAX_FINAL_DIAGNOSTICS)) {
        lines.push(`  ${diagnostic}`);
      }
      if (this.#diagnostics.length > MAX_FINAL_DIAGNOSTICS) {
        lines.push(`  +${this.#diagnostics.length - MAX_FINAL_DIAGNOSTICS} more diagnostics`);
      }
      if (this.#logPath !== undefined) {
        lines.push(`  ${this.#color.dim(`Log: ${this.#logPath}`)}`);
      }
    }

    const clear: string = this.#clearRegion();
    const restore: string = this.#cursorHidden ? SHOW_CURSOR : '';
    this.#cursorHidden = false;
    this.#paintedRowCount = 0;
    this.#terminal.write(`${clear}${lines.join('\n')}\n${restore}`);
  }
}
