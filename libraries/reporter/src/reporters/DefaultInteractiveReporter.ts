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

  readonly #terminal: IInteractiveTerminal;
  readonly #color: IColorizer;
  readonly #colorEnabled: boolean;
  readonly #nowMs: () => number;
  readonly #minRefreshIntervalMs: number;

  #commandName: string | undefined;
  readonly #watchCycles: Map<number, IWatchCycleState>;
  #legacyIterationId: number;
  #latestIterationId: number;
  #latestActivity: string;
  #latestCompletedIterationId: number;
  #result: { succeeded: boolean; exitCode: number } | undefined;
  #logPath: string | undefined;

  #spinnerIndex: number;
  #lastPaintMs: number;
  #paintedRowCount: number;
  #cursorHidden: boolean;
  #finalized: boolean;
  #stopRefreshTimer: (() => void) | undefined;
  #abortSignal: AbortSignal | undefined;

  public constructor(options: IDefaultInteractiveReporterOptions) {
    this.#terminal = options.terminal;
    this.#colorEnabled =
      options.color ?? resolveColorEnabled(options.env ?? process.env, options.terminal.isTTY);
    this.#color = createColorizer(this.#colorEnabled);
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#minRefreshIntervalMs = options.minRefreshIntervalMs ?? MIN_REFRESH_INTERVAL_MS;

    this.#commandName = undefined;
    this.#watchCycles = new Map();
    this.#legacyIterationId = 0;
    this.#latestIterationId = 0;
    this.#latestActivity = '';
    this.#latestCompletedIterationId = -1;
    this.#result = undefined;
    this.#logPath = options.logPath;

    this.#spinnerIndex = 0;
    this.#lastPaintMs = Number.NEGATIVE_INFINITY;
    this.#paintedRowCount = 0;
    this.#cursorHidden = false;
    this.#finalized = false;
  }

  public async initializeAsync(context?: IReporterContext): Promise<void> {
    this.#abortSignal = context?.abortSignal;
    if (!this.#stopRefreshTimer && this.#terminal.isTTY && !this.#finalized) {
      this.#stopRefreshTimer = startReporterTimer(
        context,
        () => {
          if (
            this.#terminal.isTTY &&
            this.#cursorHidden &&
            !this.#finalized &&
            shouldRefresh(this.#lastPaintMs, this.#nowMs(), this.#minRefreshIntervalMs)
          ) {
            this.#paint();
          }
        },
        Math.max(MIN_REFRESH_INTERVAL_MS, this.#minRefreshIntervalMs)
      );
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    if (this.#finalized) {
      return;
    }
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
    this.#stopRefreshTimer?.();
    this.#stopRefreshTimer = undefined;
    if (this.#abortSignal?.aborted && this.#abortSignal.reason instanceof Error) {
      this.#finalized = true;
      this.#paintedRowCount = 0;
      if (this.#cursorHidden) {
        this.#cursorHidden = false;
        this.#terminal.write(SHOW_CURSOR);
      }
      return;
    }
    this.#finalize();
  }

  #update(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName?: string }).commandName;
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
        const cycle: IWatchCycleState = this.#getWatchCycle(payload.iterationId);
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
        const cycle: IWatchCycleState = this.#getWatchCycle(payload.iterationId);
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
        const cycle: IWatchCycleState = this.#getWatchCycle(payload.iterationId);
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
          this.#latestActivity = this.#toSingleLine(payload.text);
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
            this.#recordDiagnostic(event, payload.severity, text, payload.iterationId);
          } else {
            this.#latestActivity = this.#toSingleLine(text);
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
          this.#recordDiagnostic(
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

  #toSingleLine(text: string): string {
    const lines: string[] = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.at(-1) ?? '';
  }

  #recordDiagnostic(
    event: IReporterEventEnvelope<unknown>,
    severity: 'error' | 'warning',
    text: string,
    iterationId: number = this.#latestIterationId,
    diagnosticId?: string
  ): void {
    const existingCycle: IWatchCycleState | undefined = this.#watchCycles.get(iterationId);
    if (
      existingCycle?.watchCompleted ||
      (!existingCycle && iterationId <= this.#latestCompletedIterationId)
    ) {
      return;
    }
    const { diagnostics } = this.#getWatchCycle(iterationId);
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
      this.#terminal.write(`${this.#clearRegion()}${boundedText}\n`);
      this.#paintedRowCount = 0;
    } else {
      diagnostics.warnings.set(identity, boundedText);
    }
  }

  #takeDiagnosticSummary(cycle: IWatchCycleState): string[] {
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

  #snapshot(): ILiveRegionState {
    const cycle: IWatchCycleState = this.#getLatestWatchCycle();
    return {
      commandName: this.#commandName,
      totalOperations: cycle.totalOperations,
      completedOperations: cycle.completedOperations,
      failedOperations: cycle.failedOperations,
      activeProjects: [...cycle.activeProjects.values()],
      latestActivity: cycle.latestActivity || this.#latestActivity
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
    const payload: { succeeded?: boolean; iterationId?: number } = event.payload as {
      succeeded?: boolean;
      iterationId?: number;
    };
    const cycle: IWatchCycleState = this.#getWatchCycle(payload.iterationId);
    const marker: string = payload.succeeded ? this.#color.green('✔') : this.#color.red('✖');
    const summary: string =
      `${marker} watch cycle ${payload.succeeded ? 'succeeded' : 'failed'} - ` +
      `${cycle.completedOperations}/${cycle.totalOperations} operations`;
    const diagnosticLines: string[] = [];
    const startupCycle: IWatchCycleState | undefined = this.#watchCycles.get(0);
    if (
      payload.iterationId !== undefined &&
      payload.iterationId > 0 &&
      startupCycle &&
      startupCycle !== cycle
    ) {
      diagnosticLines.push(...this.#takeDiagnosticSummary(startupCycle));
      startupCycle.watchCompleted = true;
    }
    diagnosticLines.push(...this.#takeDiagnosticSummary(cycle));
    if (this.#logPath && (!payload.succeeded || cycle.diagnostics.suppressed > 0)) {
      diagnosticLines.push(`Log: ${this.#logPath}`);
    }
    this.#terminal.write(`${this.#clearRegion()}${[...diagnosticLines, summary].join('\n')}\n`);
    this.#paintedRowCount = 0;
    cycle.watchCompleted = true;
    this.#latestCompletedIterationId = Math.max(
      this.#latestCompletedIterationId,
      payload.iterationId ?? this.#legacyIterationId
    );
    this.#pruneCompletedWatchCycles();
    if (payload.iterationId === undefined) {
      this.#legacyIterationId++;
    }
    if (this.#terminal.isTTY) {
      this.#paint();
    }
  }

  #getWatchCycle(iterationId?: number): IWatchCycleState {
    const resolvedIterationId: number = iterationId ?? this.#legacyIterationId;
    let cycle: IWatchCycleState | undefined = this.#watchCycles.get(resolvedIterationId);
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
      this.#watchCycles.set(resolvedIterationId, cycle);
    }
    this.#latestIterationId = Math.max(this.#latestIterationId, resolvedIterationId);
    this.#pruneCompletedWatchCycles();
    return cycle;
  }

  #getLatestWatchCycle(): IWatchCycleState {
    return this.#getWatchCycle(this.#latestIterationId);
  }

  #pruneCompletedWatchCycles(): void {
    for (const [iterationId, cycle] of this.#watchCycles) {
      if (iterationId < this.#latestIterationId && cycle.watchCompleted) {
        this.#watchCycles.delete(iterationId);
      }
    }
  }

  #finalize(): void {
    if (this.#finalized) {
      return;
    }
    this.#finalized = true;

    const lines: string[] = [];
    for (const cycle of this.#watchCycles.values()) {
      lines.push(...this.#takeDiagnosticSummary(cycle));
    }
    const cycle: IWatchCycleState = this.#getLatestWatchCycle();
    const succeeded: boolean = this.#result?.succeeded ?? false;
    if (succeeded) {
      lines.push(
        `${this.#color.green('✔')} ${this.#commandName ?? 'rush'} succeeded — ` +
          `${cycle.completedOperations}/${cycle.totalOperations} operations`
      );
      if (this.#logPath !== undefined) {
        lines.push(this.#color.dim(`Log: ${this.#logPath}`));
      }
    } else {
      lines.push(
        `${this.#color.red('✖')} ${this.#commandName ?? 'rush'} failed — ${cycle.failedOperations} failed`
      );
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
