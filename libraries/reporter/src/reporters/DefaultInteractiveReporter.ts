// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter, IReporterContext } from '../manager/IReporter';
import { getHumanReadableMessageText } from './ReporterRedaction';
import { formatHumanReadableDiagnostic } from './HumanReadableDiagnostic';
import { startReporterTimer } from '../utilities/startReporterTimer';
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
const MAX_DIAGNOSTIC_TEXT_LENGTH: number = 512;

interface IDiagnosticState {
  readonly identities: Set<string>;
  readonly warnings: Map<string, string>;
  suppressed: number;
  summarized: boolean;
}

interface IWatchCycleState {
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  readonly registeredOperations: Set<string>;
  readonly projectByOperation: Map<string, string>;
  readonly silentOperations: Set<string>;
  readonly activeProjects: Map<string, string>;
  latestActivity: string;
  watchCompleted: boolean;
  readonly diagnostics: IDiagnosticState;
}

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

  private readonly _terminal: IInteractiveTerminal;
  private readonly _color: IColorizer;
  private readonly _colorEnabled: boolean;
  private readonly _nowMs: () => number;
  private readonly _minRefreshIntervalMs: number;

  private _commandName: string | undefined;
  private readonly _watchCycles: Map<number, IWatchCycleState>;
  private _legacyIterationId: number;
  private _latestIterationId: number;
  private _latestActivity: string;
  private _latestCompletedIterationId: number;
  private _result: { succeeded: boolean; exitCode: number } | undefined;
  private _logPath: string | undefined;

  private _spinnerIndex: number;
  private _lastPaintMs: number;
  private _paintedRowCount: number;
  private _cursorHidden: boolean;
  private _finalized: boolean;
  private _stopRefreshTimer: (() => void) | undefined;
  private _abortSignal: AbortSignal | undefined;

  public constructor(options: IDefaultInteractiveReporterOptions) {
    this._terminal = options.terminal;
    this._colorEnabled =
      options.color ?? resolveColorEnabled(options.env ?? process.env, options.terminal.isTTY);
    this._color = createColorizer(this._colorEnabled);
    this._nowMs = options.nowMs ?? (() => Date.now());
    this._minRefreshIntervalMs = options.minRefreshIntervalMs ?? MIN_REFRESH_INTERVAL_MS;

    this._commandName = undefined;
    this._watchCycles = new Map();
    this._legacyIterationId = 0;
    this._latestIterationId = 0;
    this._latestActivity = '';
    this._latestCompletedIterationId = -1;
    this._result = undefined;
    this._logPath = options.logPath;

    this._spinnerIndex = 0;
    this._lastPaintMs = Number.NEGATIVE_INFINITY;
    this._paintedRowCount = 0;
    this._cursorHidden = false;
    this._finalized = false;
  }

  public async initializeAsync(context?: IReporterContext): Promise<void> {
    this._abortSignal = context?.abortSignal;
    if (!this._stopRefreshTimer && this._terminal.isTTY && !this._finalized) {
      this._stopRefreshTimer = startReporterTimer(
        context,
        () => {
          if (
            this._terminal.isTTY &&
            this._cursorHidden &&
            !this._finalized &&
            shouldRefresh(this._lastPaintMs, this._nowMs(), this._minRefreshIntervalMs)
          ) {
            this._paint();
          }
        },
        Math.max(MIN_REFRESH_INTERVAL_MS, this._minRefreshIntervalMs)
      );
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    if (this._finalized) {
      return;
    }
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
    this._stopRefreshTimer?.();
    this._stopRefreshTimer = undefined;
    if (this._abortSignal?.aborted && this._abortSignal.reason instanceof Error) {
      this._finalized = true;
      this._paintedRowCount = 0;
      if (this._cursorHidden) {
        this._cursorHidden = false;
        this._terminal.write(SHOW_CURSOR);
      }
      return;
    }
    this._finalize();
  }

  private _update(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this._commandName = (event.payload as { commandName?: string }).commandName;
        break;
      }
      case 'operationRegistered': {
        const payload: {
          operationId: string;
          projectName?: string;
          phaseName?: string;
          silent?: boolean;
          iterationId?: number;
        } = event.payload as {
          operationId: string;
          projectName?: string;
          phaseName?: string;
          silent?: boolean;
          iterationId?: number;
        };
        const cycle: IWatchCycleState = this._getWatchCycle(payload.iterationId);
        if (cycle.registeredOperations.has(payload.operationId)) {
          break;
        }
        cycle.registeredOperations.add(payload.operationId);
        if (payload.silent) {
          cycle.silentOperations.add(payload.operationId);
          break;
        }
        cycle.silentOperations.delete(payload.operationId);
        cycle.totalOperations++;
        const projectName: string = payload.projectName ?? event.scope?.projectName ?? payload.operationId;
        cycle.projectByOperation.set(
          payload.operationId,
          payload.phaseName ? `${projectName} (${payload.phaseName})` : projectName
        );
        break;
      }
      case 'operationStatusChanged': {
        const payload: {
          operationId: string;
          status: string;
          projectName?: string;
          iterationId?: number;
        } = event.payload as {
          operationId: string;
          status: string;
          projectName?: string;
          iterationId?: number;
        };
        const cycle: IWatchCycleState = this._getWatchCycle(payload.iterationId);
        const projectName: string =
          payload.projectName ??
          event.scope?.projectName ??
          cycle.projectByOperation.get(payload.operationId) ??
          payload.operationId;
        if (cycle.silentOperations.has(payload.operationId)) {
          break;
        }
        if (payload.status === 'executing') {
          cycle.activeProjects.set(payload.operationId, projectName);
        }
        cycle.latestActivity = `${payload.status} ${projectName}`;
        break;
      }
      case 'operationCompleted': {
        const payload: { operationId: string; status: string; iterationId?: number } = event.payload as {
          operationId: string;
          status: string;
          iterationId?: number;
        };
        const cycle: IWatchCycleState = this._getWatchCycle(payload.iterationId);
        if (cycle.silentOperations.delete(payload.operationId)) {
          break;
        }
        const projectName: string =
          cycle.projectByOperation.get(payload.operationId) ??
          event.scope?.projectName ??
          payload.operationId;
        cycle.activeProjects.delete(payload.operationId);
        cycle.completedOperations++;
        if (payload.status === 'failure') {
          cycle.failedOperations++;
        }
        cycle.latestActivity = `${payload.status} ${projectName}`;
        break;
      }
      case 'activityChanged': {
        const payload: { kind?: string; text?: string } = event.payload as { kind?: string; text?: string };
        if (payload.text !== undefined) {
          this._latestActivity = this._toSingleLine(payload.text);
        }
        break;
      }
      case 'messageEmitted': {
        const payload: { severity?: string; iterationId?: number } = event.payload as {
          severity?: string;
          iterationId?: number;
        };
        const text: string | undefined = getHumanReadableMessageText(event);
        if (text !== undefined) {
          if (payload.severity === 'error' || payload.severity === 'warning') {
            this._recordDiagnostic(event, payload.severity, text, payload.iterationId);
          } else {
            this._latestActivity = this._toSingleLine(text);
          }
        }
        break;
      }
      case 'diagnosticEmitted': {
        const payload: { diagnosticId?: string; severity?: string; iterationId?: number } = event.payload as {
          diagnosticId?: string;
          severity?: string;
          iterationId?: number;
        };
        if (payload.severity === 'error' || payload.severity === 'warning') {
          this._recordDiagnostic(
            event,
            payload.severity,
            formatHumanReadableDiagnostic(event),
            payload.iterationId,
            payload.diagnosticId
          );
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

  private _toSingleLine(text: string): string {
    const lines: string[] = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.at(-1) ?? '';
  }

  private _recordDiagnostic(
    event: IReporterEventEnvelope<unknown>,
    severity: 'error' | 'warning',
    text: string,
    iterationId: number = this._latestIterationId,
    diagnosticId?: string
  ): void {
    const existingCycle: IWatchCycleState | undefined = this._watchCycles.get(iterationId);
    if (
      existingCycle?.watchCompleted ||
      (!existingCycle && iterationId <= this._latestCompletedIterationId)
    ) {
      return;
    }
    const { diagnostics } = this._getWatchCycle(iterationId);
    const identity: string = createHash('sha256')
      .update(`${event.sessionId ?? ''}\0${diagnosticId ?? event.eventId ?? `${severity}\0${text}`}`)
      .digest('hex');
    if (diagnostics.identities.has(identity)) {
      return;
    }
    if (diagnostics.identities.size >= MAX_FINAL_DIAGNOSTICS) {
      diagnostics.suppressed++;
      const warningIdentity: string | undefined = diagnostics.warnings.keys().next().value;
      if (severity !== 'error' || warningIdentity === undefined) {
        return;
      }
      diagnostics.warnings.delete(warningIdentity);
      diagnostics.identities.delete(warningIdentity);
    }
    diagnostics.identities.add(identity);
    const singleLine: string = text.replace(/\s+/g, ' ').trim();
    const boundedText: string =
      singleLine.length > MAX_DIAGNOSTIC_TEXT_LENGTH
        ? `${singleLine.slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH - 1).replace(/[\uD800-\uDBFF]$/, '')}…`
        : singleLine;
    if (severity === 'error') {
      this._terminal.write(`${this._clearRegion()}${boundedText}\n`);
      this._paintedRowCount = 0;
    } else {
      diagnostics.warnings.set(identity, boundedText);
    }
  }

  private _takeDiagnosticSummary(cycle: IWatchCycleState): string[] {
    const { diagnostics } = cycle;
    if (diagnostics.summarized) {
      return [];
    }
    diagnostics.summarized = true;
    const lines: string[] = [...diagnostics.warnings.values()];
    diagnostics.warnings.clear();
    if (diagnostics.suppressed > 0) {
      lines.push(`+${diagnostics.suppressed} more diagnostic events; see the full log`);
    }
    return lines;
  }

  private _snapshot(): ILiveRegionState {
    const cycle: IWatchCycleState = this._getLatestWatchCycle();
    return {
      commandName: this._commandName,
      totalOperations: cycle.totalOperations,
      completedOperations: cycle.completedOperations,
      failedOperations: cycle.failedOperations,
      activeProjects: [...cycle.activeProjects.values()],
      latestActivity: cycle.latestActivity || this._latestActivity
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
    const payload: { succeeded?: boolean; iterationId?: number } = event.payload as {
      succeeded?: boolean;
      iterationId?: number;
    };
    const cycle: IWatchCycleState = this._getWatchCycle(payload.iterationId);
    const marker: string = payload.succeeded ? this._color.green('✔') : this._color.red('✖');
    const summary: string =
      `${marker} watch cycle ${payload.succeeded ? 'succeeded' : 'failed'} - ` +
      `${cycle.completedOperations}/${cycle.totalOperations} operations`;
    const diagnosticLines: string[] = [];
    const startupCycle: IWatchCycleState | undefined = this._watchCycles.get(0);
    if (payload.iterationId !== undefined && payload.iterationId > 0 && startupCycle && startupCycle !== cycle) {
      diagnosticLines.push(...this._takeDiagnosticSummary(startupCycle));
      startupCycle.watchCompleted = true;
    }
    diagnosticLines.push(...this._takeDiagnosticSummary(cycle));
    if (this._logPath && (!payload.succeeded || cycle.diagnostics.suppressed > 0)) {
      diagnosticLines.push(`Log: ${this._logPath}`);
    }
    this._terminal.write(`${this._clearRegion()}${[...diagnosticLines, summary].join('\n')}\n`);
    this._paintedRowCount = 0;
    cycle.watchCompleted = true;
    this._latestCompletedIterationId = Math.max(
      this._latestCompletedIterationId,
      payload.iterationId ?? this._legacyIterationId
    );
    this._pruneCompletedWatchCycles();
    if (payload.iterationId === undefined) {
      this._legacyIterationId++;
    }
    if (this._terminal.isTTY) {
      this._paint();
    }
  }

  private _getWatchCycle(iterationId?: number): IWatchCycleState {
    const resolvedIterationId: number = iterationId ?? this._legacyIterationId;
    let cycle: IWatchCycleState | undefined = this._watchCycles.get(resolvedIterationId);
    if (!cycle) {
      cycle = {
        totalOperations: 0,
        completedOperations: 0,
        failedOperations: 0,
        registeredOperations: new Set(),
        projectByOperation: new Map(),
        silentOperations: new Set(),
        activeProjects: new Map(),
        latestActivity: '',
        watchCompleted: false,
        diagnostics: {
          identities: new Set(),
          warnings: new Map(),
          suppressed: 0,
          summarized: false
        }
      };
      this._watchCycles.set(resolvedIterationId, cycle);
    }
    this._latestIterationId = Math.max(this._latestIterationId, resolvedIterationId);
    this._pruneCompletedWatchCycles();
    return cycle;
  }

  private _getLatestWatchCycle(): IWatchCycleState {
    return this._getWatchCycle(this._latestIterationId);
  }

  private _pruneCompletedWatchCycles(): void {
    for (const [iterationId, cycle] of this._watchCycles) {
      if (iterationId < this._latestIterationId && cycle.watchCompleted) {
        this._watchCycles.delete(iterationId);
      }
    }
  }

  private _finalize(): void {
    if (this._finalized) {
      return;
    }
    this._finalized = true;

    const lines: string[] = [];
    for (const cycle of this._watchCycles.values()) {
      lines.push(...this._takeDiagnosticSummary(cycle));
    }
    const cycle: IWatchCycleState = this._getLatestWatchCycle();
    const succeeded: boolean = this._result?.succeeded ?? false;
    if (succeeded) {
      lines.push(
        `${this._color.green('✔')} ${this._commandName ?? 'rush'} succeeded — ` +
          `${cycle.completedOperations}/${cycle.totalOperations} operations`
      );
      if (this._logPath !== undefined) {
        lines.push(this._color.dim(`Log: ${this._logPath}`));
      }
    } else {
      lines.push(
        `${this._color.red('✖')} ${this._commandName ?? 'rush'} failed — ${cycle.failedOperations} failed`
      );
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
