// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { ReporterJsonValue } from '../events/ReporterJsonValue';
import type { IReporter } from '../manager/IReporter';
import type { IRushRemediationAction } from '../diagnostics/IRushRemediationAction';
import type { IClassifiedDiagnosticValue } from '../diagnostics/IClassifiedDiagnosticValue';
import { REPORTER_PERFORMANCE_BUDGETS } from '../perf/PerformanceBudgets';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';

const MIN_AI_MAX_BYTES: number = 512;
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'success',
  'successWithWarnings',
  'failure',
  'blocked',
  'skipped',
  'fromCache',
  'noOp',
  'aborted'
]);

interface IAiDiagnosticState {
  readonly errorDiagnostics: ICollectedAiDiagnostic[];
  readonly warningDiagnostics: ICollectedAiDiagnostic[];
  readonly errorCodes: Set<string>;
  readonly diagnosticCategoryCounts: { [category: string]: number };
  suppressedSecretErrorCount: number;
  suppressedSecretWarningCount: number;
  errorDiagnosticsTruncated: boolean;
  warningDiagnosticsTruncated: boolean;
  errorCount: number;
  warningCount: number;
}

interface IAiWatchCycleState {
  readonly registeredOperations: Set<string>;
  readonly projectByOperation: Map<string, string>;
  readonly silentOperations: Set<string>;
  readonly operationCounts: { [status: string]: number };
  readonly failedProjects: string[];
  readonly diagnostics: IAiDiagnosticState;
  watchCompleted: boolean;
}

function createDiagnosticState(): IAiDiagnosticState {
  return {
    errorDiagnostics: [],
    warningDiagnostics: [],
    errorCodes: new Set(),
    diagnosticCategoryCounts: {},
    suppressedSecretErrorCount: 0,
    suppressedSecretWarningCount: 0,
    errorDiagnosticsTruncated: false,
    warningDiagnosticsTruncated: false,
    errorCount: 0,
    warningCount: 0
  };
}

/**
 * A bounded diagnostic in an AI record.
 *
 * @beta
 */
export interface IAiDiagnostic {
  readonly diagnosticId?: string;
  readonly code: string;
  readonly category: string;
  readonly severity: string;
  readonly summary?: string;
  readonly summaryKey?: string;
  readonly detailKey?: string;
  readonly context?: Readonly<Record<string, ReporterJsonValue | '[local-sensitive]' | '[secret]'>>;
  readonly remediation?: readonly IRushRemediationAction[];
}

interface ICollectedAiDiagnostic extends IAiDiagnostic {
  readonly causeDiagnosticIds?: readonly string[];
}

/**
 * The AI reporter's log reference.
 *
 * @beta
 */
export interface IAiLogReference {
  readonly path: string;
  readonly format?: string;
  readonly complete: boolean;
}

/**
 * The AI reporter's bounded final record.
 *
 * @beta
 */
export interface IAiFinalRecord {
  readonly kind: 'ai.final';
  readonly protocolVersion: IReporterProtocolVersion;
  readonly result: 'succeeded' | 'failed';
  readonly exitCode: number;
  readonly scope: { readonly commandName?: string; readonly failedProjects: readonly string[] };
  readonly errorCodes: readonly string[];
  readonly diagnosticCategoryCounts: { readonly [category: string]: number };
  readonly diagnostics: readonly IAiDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly operationCounts: { readonly [status: string]: number };
  readonly log?: IAiLogReference;
  readonly truncated: boolean;
}

/**
 * Options for {@link AiReporter}.
 *
 * @beta
 */
export interface IAiReporterOptions {
  /**
   * The exclusive stdout sink. It receives bounded NDJSON records only.
   */
  readonly write: (text: string) => void;

  /**
   * The maximum size of the final record in bytes. Defaults to 64 KiB.
   */
  readonly maxBytes?: number;

  /**
   * The maximum number of detailed diagnostics. Defaults to 20.
   */
  readonly maxDetailedDiagnostics?: number;
}

/**
 * The bounded AI reporter, a versioned public beta projection.
 *
 * @remarks
 * The reporter owns stdout exclusively and emits a compact status record and a
 * bounded final record. The final record carries the result and exit code,
 * operation and project scope, error codes and categories, structured
 * remediation, aggregate counts, the primary log reference, and artifact
 * completeness. It is capped at 64 KiB and 20 detailed diagnostics, excludes raw
 * logs and stacks, and represents warnings by count when failures exist. The
 * absolute log path is local reporter output and never enters telemetry.
 *
 * @beta
 */
export class AiReporter implements IReporter {
  public readonly name: string = 'ai';

  private readonly _write: (text: string) => void;
  private readonly _maxBytes: number;
  private readonly _maxDetailedDiagnostics: number;

  private _protocolVersion: IReporterProtocolVersion;
  private _commandName: string | undefined;
  private readonly _watchCycles: Map<number, IAiWatchCycleState>;
  private readonly _globalDiagnostics: IAiDiagnosticState;
  private readonly _fallbackErrorMessages: string[];
  private _fallbackErrorCount: number;
  private _fallbackErrorsTruncated: boolean;
  private _logPath: string | undefined;
  private _logFormat: string | undefined;
  private _artifactComplete: boolean;
  private _finalEmitted: boolean;
  private _pendingResult: { succeeded: boolean; exitCode: number } | undefined;
  private _legacyIterationId: number;
  private _latestIterationId: number;

  public constructor(options: IAiReporterOptions) {
    this._write = options.write;
    this._maxBytes = options.maxBytes ?? REPORTER_PERFORMANCE_BUDGETS.maxAiOutputBytes;
    this._maxDetailedDiagnostics =
      options.maxDetailedDiagnostics ?? REPORTER_PERFORMANCE_BUDGETS.maxAiDetailedDiagnostics;
    if (!Number.isInteger(this._maxBytes) || this._maxBytes < MIN_AI_MAX_BYTES) {
      throw new RangeError(`maxBytes must be an integer of at least ${MIN_AI_MAX_BYTES}`);
    }
    if (!Number.isInteger(this._maxDetailedDiagnostics) || this._maxDetailedDiagnostics < 0) {
      throw new RangeError('maxDetailedDiagnostics must be a nonnegative integer');
    }

    this._protocolVersion = REPORTER_PROTOCOL_VERSION;
    this._commandName = undefined;
    this._watchCycles = new Map();
    this._globalDiagnostics = createDiagnosticState();
    this._fallbackErrorMessages = [];
    this._fallbackErrorCount = 0;
    this._fallbackErrorsTruncated = false;
    this._logPath = undefined;
    this._logFormat = undefined;
    this._artifactComplete = true;
    this._finalEmitted = false;
    this._pendingResult = undefined;
    this._legacyIterationId = 0;
    this._latestIterationId = 0;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this._protocolVersion = event.protocolVersion;
    if (event.privacy === 'secret') {
      switch (event.type) {
        case 'diagnosticEmitted':
        case 'messageEmitted':
        case 'commandResult':
        case 'sessionCompleted':
          break;
        default:
          return;
      }
    }
    switch (event.type) {
      case 'commandStarted': {
        this._commandName = (event.payload as { commandName: string }).commandName;
        this._write(
          `${JSON.stringify({
            kind: 'ai.status',
            protocolVersion: this._protocolVersion,
            commandName: this._commandName
          })}\n`
        );
        break;
      }
      case 'operationRegistered': {
        const payload: {
          operationId: string;
          projectName?: string;
          silent?: boolean;
          iterationId?: number;
        } = event.payload as {
          operationId: string;
          projectName?: string;
          silent?: boolean;
          iterationId?: number;
        };
        const cycle: IAiWatchCycleState = this._getWatchCycle(payload.iterationId);
        if (cycle.registeredOperations.has(payload.operationId)) {
          break;
        }
        cycle.registeredOperations.add(payload.operationId);
        if (payload.silent) {
          cycle.silentOperations.add(payload.operationId);
        }
        if (payload.projectName !== undefined) {
          cycle.projectByOperation.set(payload.operationId, payload.projectName);
        }
        break;
      }
      case 'operationStatusChanged': {
        break;
      }
      case 'operationCompleted': {
        const payload: { operationId: string; status: string; iterationId?: number } = event.payload as {
          operationId: string;
          status: string;
          iterationId?: number;
        };
        const cycle: IAiWatchCycleState = this._getWatchCycle(payload.iterationId);
        if (cycle.silentOperations.has(payload.operationId)) {
          cycle.silentOperations.delete(payload.operationId);
          break;
        }
        if (TERMINAL_STATUSES.has(payload.status)) {
          cycle.operationCounts[payload.status] = (cycle.operationCounts[payload.status] ?? 0) + 1;
          if (payload.status === 'failure') {
            const projectName: string =
              cycle.projectByOperation.get(payload.operationId) ??
              event.scope?.projectName ??
              payload.operationId;
            cycle.failedProjects.push(projectName);
          }
        }
        break;
      }
      case 'diagnosticEmitted': {
        const diagnostic: { readonly iterationId?: number } = event.payload as {
          readonly iterationId?: number;
        };
        this._collectDiagnostic(
          event,
          diagnostic.iterationId === undefined
            ? this._globalDiagnostics
            : this._getWatchCycle(diagnostic.iterationId).diagnostics
        );
        break;
      }
      case 'watchCycleCompleted': {
        const payload: { succeeded?: boolean; iterationId?: number } = event.payload as {
          succeeded?: boolean;
          iterationId?: number;
        };
        const cycle: IAiWatchCycleState = this._getWatchCycle(payload.iterationId);
        const succeeded: boolean = payload.succeeded === true;
        this._write(
          `${JSON.stringify({
            kind: 'ai.watchCycle',
            protocolVersion: this._protocolVersion,
            succeeded,
            operationCounts: { ...cycle.operationCounts },
            failedProjects: [...cycle.failedProjects]
          })}\n`
        );
        if (payload.iterationId === undefined) {
          this._legacyIterationId++;
        }
        cycle.watchCompleted = true;
        this._pruneCompletedWatchCycles();
        break;
      }
      case 'messageEmitted': {
        const payload: { severity?: string; text?: string } = event.payload as {
          severity?: string;
          text?: string;
        };
        if (payload.severity === 'error' && payload.text) {
          this._fallbackErrorCount++;
          if (
            event.privacy === 'public' &&
            this._fallbackErrorMessages.length < this._maxDetailedDiagnostics
          ) {
            this._fallbackErrorMessages.push(payload.text.trim());
          } else {
            this._fallbackErrorsTruncated = true;
          }
        }
        break;
      }
      case 'artifactAvailable': {
        const payload: { role?: string; path?: string; format?: string; complete?: boolean } =
          event.payload as { role?: string; path?: string; format?: string; complete?: boolean };
        if (payload.role === 'log' && payload.path !== undefined) {
          this._logPath = payload.path;
          this._logFormat = payload.format;
          this._artifactComplete = payload.complete !== false;
        }
        break;
      }
      case 'commandResult': {
        const payload: { succeeded: boolean; exitCode: number } = event.payload as {
          succeeded: boolean;
          exitCode: number;
        };
        this._pendingResult = payload;
        break;
      }
      case 'sessionCompleted': {
        if (!this._pendingResult) {
          const exitCode: number = (event.payload as { exitCode?: number }).exitCode ?? 1;
          this._pendingResult = { succeeded: exitCode === 0, exitCode };
        }
        break;
      }
      default:
        break;
    }
  }

  public async flushAsync(): Promise<void> {
    /* no-op */
  }

  public async closeAsync(): Promise<void> {
    if (!this._finalEmitted) {
      const result: { succeeded: boolean; exitCode: number } = this._pendingResult ?? {
        succeeded: false,
        exitCode: 1
      };
      this._emitFinal(result.succeeded, result.exitCode);
    }
  }

  private _collectDiagnostic(event: IReporterEventEnvelope<unknown>, state: IAiDiagnosticState): void {
    const diagnostic: IAiDiagnostic & {
      readonly causeDiagnosticIds?: readonly string[];
      readonly parameters?: Readonly<Record<string, IClassifiedDiagnosticValue>>;
    } = event.payload as IAiDiagnostic & {
      readonly causeDiagnosticIds?: readonly string[];
      readonly parameters?: Readonly<Record<string, IClassifiedDiagnosticValue>>;
    };
    if (event.privacy === 'secret') {
      if (diagnostic.severity === 'error') {
        state.suppressedSecretErrorCount++;
      } else if (diagnostic.severity === 'warning') {
        state.suppressedSecretWarningCount++;
      }
      return;
    }
    if (diagnostic.category !== undefined) {
      state.diagnosticCategoryCounts[diagnostic.category] =
        (state.diagnosticCategoryCounts[diagnostic.category] ?? 0) + 1;
    }
    const collected: ICollectedAiDiagnostic = {
      diagnosticId: diagnostic.diagnosticId,
      code: diagnostic.code,
      category: diagnostic.category,
      severity: diagnostic.severity,
      summary: diagnostic.summary,
      summaryKey: diagnostic.summaryKey,
      detailKey: diagnostic.detailKey,
      context: this._projectDiagnosticContext(diagnostic.parameters),
      remediation: diagnostic.remediation,
      causeDiagnosticIds: diagnostic.causeDiagnosticIds
    };
    if (diagnostic.severity === 'error') {
      state.errorCount++;
      state.errorCodes.add(diagnostic.code);
      if (state.errorDiagnostics.length < this._maxDetailedDiagnostics) {
        state.errorDiagnostics.push(collected);
      } else {
        state.errorDiagnosticsTruncated = true;
      }
    } else if (diagnostic.severity === 'warning') {
      state.warningCount++;
      if (state.warningDiagnostics.length < this._maxDetailedDiagnostics) {
        state.warningDiagnostics.push(collected);
      } else {
        state.warningDiagnosticsTruncated = true;
      }
    }
  }

  private _getWatchCycle(iterationId?: number): IAiWatchCycleState {
    const resolvedIterationId: number = iterationId ?? this._legacyIterationId;
    let cycle: IAiWatchCycleState | undefined = this._watchCycles.get(resolvedIterationId);
    if (!cycle) {
      cycle = {
        registeredOperations: new Set(),
        projectByOperation: new Map(),
        silentOperations: new Set(),
        operationCounts: {},
        failedProjects: [],
        diagnostics: createDiagnosticState(),
        watchCompleted: false
      };
      this._watchCycles.set(resolvedIterationId, cycle);
    }
    this._latestIterationId = Math.max(this._latestIterationId, resolvedIterationId);
    this._pruneCompletedWatchCycles();
    return cycle;
  }

  private _getLatestWatchCycle(): IAiWatchCycleState {
    return this._getWatchCycle(this._latestIterationId);
  }

  private _pruneCompletedWatchCycles(): void {
    for (const [iterationId, cycle] of this._watchCycles) {
      if (iterationId < this._latestIterationId && cycle.watchCompleted) {
        this._watchCycles.delete(iterationId);
      }
    }
  }

  private _projectDiagnosticContext(
    parameters: Readonly<Record<string, IClassifiedDiagnosticValue>> | undefined
  ): Readonly<Record<string, ReporterJsonValue | '[local-sensitive]' | '[secret]'>> | undefined {
    if (!parameters) {
      return undefined;
    }
    const context: Record<string, ReporterJsonValue | '[local-sensitive]' | '[secret]'> = {};
    for (const name of Object.keys(parameters).sort()) {
      const parameter: IClassifiedDiagnosticValue = parameters[name];
      context[name] = parameter.privacy === 'public' ? parameter.value : (`[${parameter.privacy}]` as const);
    }
    return Object.keys(context).length > 0 ? context : undefined;
  }

  private _orderDiagnostics(diagnostics: readonly ICollectedAiDiagnostic[]): IAiDiagnostic[] {
    const byId: Map<string, ICollectedAiDiagnostic> = new Map();
    for (const diagnostic of diagnostics) {
      if (diagnostic.diagnosticId) {
        byId.set(diagnostic.diagnosticId, diagnostic);
      }
    }

    const ordered: IAiDiagnostic[] = [];
    const visited: Set<ICollectedAiDiagnostic> = new Set();
    const visiting: Set<ICollectedAiDiagnostic> = new Set();
    const visit = (diagnostic: ICollectedAiDiagnostic): void => {
      if (visited.has(diagnostic) || visiting.has(diagnostic)) {
        return;
      }
      visiting.add(diagnostic);
      for (const causeId of diagnostic.causeDiagnosticIds ?? []) {
        const cause: ICollectedAiDiagnostic | undefined = byId.get(causeId);
        if (cause) {
          visit(cause);
        }
      }
      visiting.delete(diagnostic);
      visited.add(diagnostic);
      ordered.push({
        diagnosticId: diagnostic.diagnosticId,
        code: diagnostic.code,
        category: diagnostic.category,
        severity: diagnostic.severity,
        summary: diagnostic.summary,
        summaryKey: diagnostic.summaryKey,
        detailKey: diagnostic.detailKey,
        context: diagnostic.context,
        remediation: diagnostic.remediation
      });
    };

    for (const diagnostic of diagnostics) {
      visit(diagnostic);
    }
    return ordered;
  }

  private _emitFinal(succeeded: boolean, exitCode: number): void {
    if (this._finalEmitted) {
      return;
    }
    this._finalEmitted = true;

    const cycle: IAiWatchCycleState = this._getLatestWatchCycle();
    const cycleDiagnostics: IAiDiagnosticState = cycle.diagnostics;
    const errorCountWithoutFallback: number =
      this._globalDiagnostics.errorCount + cycleDiagnostics.errorCount;
    const suppressedSecretErrorCount: number =
      this._globalDiagnostics.suppressedSecretErrorCount + cycleDiagnostics.suppressedSecretErrorCount;
    const suppressedSecretWarningCount: number =
      this._globalDiagnostics.suppressedSecretWarningCount + cycleDiagnostics.suppressedSecretWarningCount;
    const warningCount: number =
      this._globalDiagnostics.warningCount + cycleDiagnostics.warningCount + suppressedSecretWarningCount;
    const collectedErrorDiagnostics: IAiDiagnostic[] = this._orderDiagnostics([
      ...this._globalDiagnostics.errorDiagnostics,
      ...cycleDiagnostics.errorDiagnostics
    ]);
    const collectedWarningDiagnostics: IAiDiagnostic[] = this._orderDiagnostics([
      ...this._globalDiagnostics.warningDiagnostics,
      ...cycleDiagnostics.warningDiagnostics
    ]);
    const fallbackDiagnostics: IAiDiagnostic[] =
      errorCountWithoutFallback === 0
        ? this._fallbackErrorMessages.map((summary) => ({
            code: 'RUSH_COMMAND_FAILED',
            category: 'command',
            severity: 'error',
            summary
          }))
        : [];
    const hasFallbackErrors: boolean = errorCountWithoutFallback === 0 && this._fallbackErrorCount > 0;
    const errorDiagnostics: IAiDiagnostic[] = hasFallbackErrors
      ? fallbackDiagnostics
      : collectedErrorDiagnostics;
    const errorCount: number =
      errorCountWithoutFallback +
      suppressedSecretErrorCount +
      (hasFallbackErrors ? this._fallbackErrorCount : 0);
    const errorCodes: string[] = hasFallbackErrors
      ? ['RUSH_COMMAND_FAILED']
      : [...new Set([...this._globalDiagnostics.errorCodes, ...cycleDiagnostics.errorCodes])].sort();
    const diagnosticCategoryCounts: { [category: string]: number } = {
      ...this._globalDiagnostics.diagnosticCategoryCounts
    };
    for (const [category, count] of Object.entries(cycleDiagnostics.diagnosticCategoryCounts)) {
      diagnosticCategoryCounts[category] = (diagnosticCategoryCounts[category] ?? 0) + count;
    }
    if (hasFallbackErrors) {
      diagnosticCategoryCounts.command = (diagnosticCategoryCounts.command ?? 0) + this._fallbackErrorCount;
    }
    const hasFailures: boolean = !succeeded || errorCount > 0;
    // When failures exist, warnings are represented by counts only. Warning-only
    // success may include bounded warning details.
    const detailedSource: IAiDiagnostic[] = hasFailures ? errorDiagnostics : collectedWarningDiagnostics;

    const record: {
      kind: 'ai.final';
      protocolVersion: IReporterProtocolVersion;
      result: 'succeeded' | 'failed';
      exitCode: number;
      scope: { commandName?: string; failedProjects: string[] };
      errorCodes: string[];
      diagnosticCategoryCounts: { [category: string]: number };
      diagnostics: IAiDiagnostic[];
      errorCount: number;
      warningCount: number;
      operationCounts: { [status: string]: number };
      log?: IAiLogReference;
      truncated: boolean;
    } = {
      kind: 'ai.final',
      protocolVersion: this._protocolVersion,
      result: succeeded ? 'succeeded' : 'failed',
      exitCode,
      scope: { commandName: this._commandName, failedProjects: [...cycle.failedProjects] },
      errorCodes,
      diagnosticCategoryCounts,
      diagnostics: detailedSource.slice(0, this._maxDetailedDiagnostics),
      errorCount,
      warningCount,
      operationCounts: { ...cycle.operationCounts },
      truncated: hasFailures
        ? this._globalDiagnostics.errorDiagnosticsTruncated ||
          cycleDiagnostics.errorDiagnosticsTruncated ||
          suppressedSecretErrorCount > 0 ||
          (hasFallbackErrors && this._fallbackErrorsTruncated)
        : this._globalDiagnostics.warningDiagnosticsTruncated ||
          cycleDiagnostics.warningDiagnosticsTruncated ||
          suppressedSecretWarningCount > 0
    };

    if (this._logPath !== undefined) {
      record.log = { path: this._logPath, format: this._logFormat, complete: this._artifactComplete };
    }

    // Enforce the byte cap by progressively trimming detailed diagnostics, then
    // error codes, then failed projects, so the record always fits the budget.
    const trimTargets: Array<{ get: () => unknown[]; set: (value: unknown[]) => void }> = [
      {
        get: () => record.diagnostics,
        set: (value: unknown[]) => (record.diagnostics = value as IAiDiagnostic[])
      },
      { get: () => record.errorCodes, set: (value: unknown[]) => (record.errorCodes = value as string[]) },
      {
        get: () => record.scope.failedProjects,
        set: (value: unknown[]) => (record.scope.failedProjects = value as string[])
      }
    ];
    for (const target of trimTargets) {
      while (Buffer.byteLength(JSON.stringify(record), 'utf8') > this._maxBytes && target.get().length > 0) {
        target.set(target.get().slice(0, target.get().length - 1));
        record.truncated = true;
      }
      if (Buffer.byteLength(JSON.stringify(record), 'utf8') <= this._maxBytes) {
        break;
      }
    }

    let serialized: string = JSON.stringify(record);
    if (Buffer.byteLength(serialized, 'utf8') > this._maxBytes) {
      record.scope = { failedProjects: [] };
      record.errorCodes = [];
      record.diagnosticCategoryCounts = {};
      record.diagnostics = [];
      record.operationCounts = {};
      delete record.log;
      record.truncated = true;
      serialized = JSON.stringify(record);
    }
    if (Buffer.byteLength(serialized, 'utf8') > this._maxBytes) {
      throw new Error(`The minimal AI final record exceeds maxBytes=${this._maxBytes}`);
    }
    this._write(`${serialized}\n`);
  }
}
