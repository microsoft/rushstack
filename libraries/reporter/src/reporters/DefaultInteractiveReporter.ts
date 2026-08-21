// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import {
  SPINNER_FRAMES,
  MIN_REFRESH_INTERVAL_MS,
  createColorizer,
  renderLiveRegion,
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

  private readonly _terminal: IInteractiveTerminal;
  private readonly _color: IColorizer;
  private readonly _colorEnabled: boolean;
  private readonly _nowMs: () => number;
  private readonly _minRefreshIntervalMs: number;

  private _commandName: string | undefined;
  private _totalOperations: number;
  private _completedOperations: number;
  private _failedOperations: number;
  private readonly _activeProjects: Map<string, string>;
  private _latestActivity: string;
  private readonly _diagnostics: string[];
  private _result: { succeeded: boolean; exitCode: number } | undefined;
  private _logPath: string | undefined;

  private _spinnerIndex: number;
  private _lastPaintMs: number;
  private _paintedRowCount: number;
  private _cursorHidden: boolean;
  private _finalized: boolean;

  public constructor(options: IDefaultInteractiveReporterOptions) {
    this._terminal = options.terminal;
    this._colorEnabled = options.color ?? options.terminal.isTTY;
    this._color = createColorizer(this._colorEnabled);
    this._nowMs = options.nowMs ?? (() => Date.now());
    this._minRefreshIntervalMs = options.minRefreshIntervalMs ?? MIN_REFRESH_INTERVAL_MS;

    this._commandName = undefined;
    this._totalOperations = 0;
    this._completedOperations = 0;
    this._failedOperations = 0;
    this._activeProjects = new Map();
    this._latestActivity = '';
    this._diagnostics = [];
    this._result = undefined;
    this._logPath = options.logPath;

    this._spinnerIndex = 0;
    this._lastPaintMs = Number.NEGATIVE_INFINITY;
    this._paintedRowCount = 0;
    this._cursorHidden = false;
    this._finalized = false;
  }

  public async initializeAsync(): Promise<void> {
    /* The cursor is hidden lazily on the first paint. */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this._update(event);
    if (event.type === 'watchCycleCompleted') {
      this._appendWatchSummary(event);
      return;
    }
    if (this._terminal.isTTY && shouldRefresh(this._lastPaintMs, this._nowMs(), this._minRefreshIntervalMs)) {
      this._paint();
    }
  }

  public async flushAsync(): Promise<void> {
    if (this._terminal.isTTY && !this._finalized) {
      this._paint();
    }
  }

  public async closeAsync(): Promise<void> {
    this._finalize();
  }

  private _update(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this._commandName = (event.payload as { commandName?: string }).commandName;
        break;
      }
      case 'operationRegistered': {
        this._totalOperations++;
        break;
      }
      case 'operationStatusChanged': {
        const payload: { operationId: string; status: string; projectName?: string } = event.payload as {
          operationId: string;
          status: string;
          projectName?: string;
        };
        const projectName: string = payload.projectName ?? event.scope?.projectName ?? payload.operationId;
        if (payload.status === 'executing') {
          this._activeProjects.set(payload.operationId, projectName);
        } else if (TERMINAL_STATUSES.has(payload.status)) {
          this._activeProjects.delete(payload.operationId);
          this._completedOperations++;
          if (payload.status === 'failure') {
            this._failedOperations++;
          }
        }
        this._latestActivity = `${payload.status} ${projectName}`;
        break;
      }
      case 'activityChanged': {
        const payload: { kind?: string; text?: string } = event.payload as { kind?: string; text?: string };
        if (payload.text !== undefined) {
          this._latestActivity = payload.text;
        }
        break;
      }
      case 'diagnosticEmitted': {
        const payload: { code?: string; severity?: string } = event.payload as {
          code?: string;
          severity?: string;
        };
        if (payload.severity === 'error' || payload.severity === 'warning') {
          this._diagnostics.push(`[${payload.severity}] ${payload.code ?? 'unknown'}`);
        }
        break;
      }
      case 'artifactAvailable': {
        const payload: { role?: string; path?: string } = event.payload as { role?: string; path?: string };
        if (payload.role === 'log' && payload.path !== undefined) {
          this._logPath = payload.path;
        }
        break;
      }
      case 'commandResult': {
        this._result = event.payload as { succeeded: boolean; exitCode: number };
        break;
      }
      default:
        break;
    }
  }

  private _snapshot(): ILiveRegionState {
    return {
      commandName: this._commandName,
      totalOperations: this._totalOperations,
      completedOperations: this._completedOperations,
      failedOperations: this._failedOperations,
      activeProjects: [...this._activeProjects.values()],
      latestActivity: this._latestActivity
    };
  }

  private _paint(): void {
    if (!this._cursorHidden) {
      this._terminal.write(HIDE_CURSOR);
      this._cursorHidden = true;
    }
    const spinnerFrame: string = SPINNER_FRAMES[this._spinnerIndex % SPINNER_FRAMES.length];
    this._spinnerIndex++;
    const rows: string[] = renderLiveRegion(this._snapshot(), {
      width: this._terminal.columns,
      spinnerFrame,
      color: this._color
    });
    this._terminal.write(`${this._clearRegion()}${rows.join('\n')}\n`);
    this._paintedRowCount = rows.length;
    this._lastPaintMs = this._nowMs();
  }

  private _clearRegion(): string {
    if (this._paintedRowCount === 0) {
      return '';
    }
    return `\u001b[${this._paintedRowCount}A\u001b[0J`;
  }

  private _appendWatchSummary(event: IReporterEventEnvelope<unknown>): void {
    const payload: { succeeded?: boolean } = event.payload as { succeeded?: boolean };
    const marker: string = payload.succeeded ? this._color.green('✔') : this._color.red('✖');
    const summary: string = `${marker} watch cycle ${payload.succeeded ? 'succeeded' : 'failed'}`;
    this._terminal.write(`${this._clearRegion()}${summary}\n`);
    this._paintedRowCount = 0;
    if (this._terminal.isTTY) {
      this._paint();
    }
  }

  private _finalize(): void {
    if (this._finalized) {
      return;
    }
    this._finalized = true;

    const lines: string[] = [];
    const succeeded: boolean = this._result ? this._result.succeeded : this._failedOperations === 0;
    if (succeeded) {
      lines.push(
        `${this._color.green('✔')} ${this._commandName ?? 'rush'} succeeded — ` +
          `${this._completedOperations}/${this._totalOperations} operations`
      );
    } else {
      lines.push(
        `${this._color.red('✖')} ${this._commandName ?? 'rush'} failed — ${this._failedOperations} failed`
      );
      for (const diagnostic of this._diagnostics.slice(0, MAX_FINAL_DIAGNOSTICS)) {
        lines.push(`  ${diagnostic}`);
      }
      if (this._diagnostics.length > MAX_FINAL_DIAGNOSTICS) {
        lines.push(`  +${this._diagnostics.length - MAX_FINAL_DIAGNOSTICS} more diagnostics`);
      }
      if (this._logPath !== undefined) {
        lines.push(`  ${this._color.dim(`Log: ${this._logPath}`)}`);
      }
    }

    const clear: string = this._clearRegion();
    const restore: string = this._cursorHidden ? SHOW_CURSOR : '';
    this._cursorHidden = false;
    this._paintedRowCount = 0;
    this._terminal.write(`${clear}${lines.join('\n')}\n${restore}`);
  }
}
