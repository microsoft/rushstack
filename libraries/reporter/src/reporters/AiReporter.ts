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

interface IPendingAiProgress {
  readonly kind: 'ai.status' | 'ai.watchCycle';
  readonly line: string;
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
  /**
   * A nonstandard summary key. The standard `diagnostic.${code}.summary` key is implicit.
   */
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
   * The maximum UTF-8 size of the entire invocation, including NDJSON delimiters.
   * Defaults to 64 KiB.
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

  readonly #write: (text: string) => void;
  readonly #maxBytes: number;
  readonly #maxDetailedDiagnostics: number;

  #protocolVersion: IReporterProtocolVersion;
  #commandName: string | undefined;
  readonly #watchCycles: Map<number, IAiWatchCycleState>;
  readonly #globalDiagnostics: IAiDiagnosticState;
  readonly #fallbackErrorMessages: string[];
  #fallbackErrorCount: number;
  #fallbackErrorsTruncated: boolean;
  #logPath: string | undefined;
  #logFormat: string | undefined;
  #artifactComplete: boolean;
  #finalEmitted: boolean;
  #pendingResult: { succeeded: boolean; exitCode: number } | undefined;
  #legacyIterationId: number;
  #latestIterationId: number;
  readonly #pendingProgress: IPendingAiProgress[] = [];
  #pendingProgressBytes: number = 0;
  #writtenBytes: number = 0;
  #progressTruncated: boolean = false;

  public constructor(options: IAiReporterOptions) {
    this.#write = options.write;
    this.#maxBytes = options.maxBytes ?? REPORTER_PERFORMANCE_BUDGETS.maxAiOutputBytes;
    this.#maxDetailedDiagnostics =
      options.maxDetailedDiagnostics ?? REPORTER_PERFORMANCE_BUDGETS.maxAiDetailedDiagnostics;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < MIN_AI_MAX_BYTES) {
      throw new RangeError(`maxBytes must be an integer of at least ${MIN_AI_MAX_BYTES}`);
    }
    if (!Number.isInteger(this.#maxDetailedDiagnostics) || this.#maxDetailedDiagnostics < 0) {
      throw new RangeError('maxDetailedDiagnostics must be a nonnegative integer');
    }

    this.#protocolVersion = REPORTER_PROTOCOL_VERSION;
    this.#commandName = undefined;
    this.#watchCycles = new Map();
    this.#globalDiagnostics = createDiagnosticState();
    this.#fallbackErrorMessages = [];
    this.#fallbackErrorCount = 0;
    this.#fallbackErrorsTruncated = false;
    this.#logPath = undefined;
    this.#logFormat = undefined;
    this.#artifactComplete = true;
    this.#finalEmitted = false;
    this.#pendingResult = undefined;
    this.#legacyIterationId = 0;
    this.#latestIterationId = 0;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    if (this.#finalEmitted) {
      return;
    }
    this.#protocolVersion = event.protocolVersion;
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
    if (
      this.#logPath !== undefined &&
      event.type !== 'artifactAvailable' &&
      event.type !== 'commandResult' &&
      event.type !== 'sessionCompleted'
    ) {
      this.#flushPendingProgress();
    }
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName: string }).commandName;
        this.#writeProgressRecord({ kind: 'ai.status', protocolVersion: this.#protocolVersion });
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
        const cycle: IAiWatchCycleState = this.#getWatchCycle(payload.iterationId);
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
        const cycle: IAiWatchCycleState = this.#getWatchCycle(payload.iterationId);
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
        this.#collectDiagnostic(
          event,
          diagnostic.iterationId === undefined
            ? this.#globalDiagnostics
            : this.#getWatchCycle(diagnostic.iterationId).diagnostics
        );
        break;
      }
      case 'watchCycleCompleted': {
        const payload: { succeeded?: boolean; iterationId?: number } = event.payload as {
          succeeded?: boolean;
          iterationId?: number;
        };
        const cycle: IAiWatchCycleState = this.#getWatchCycle(payload.iterationId);
        const succeeded: boolean = payload.succeeded === true;
        this.#writeProgressRecord({
          kind: 'ai.watchCycle',
          protocolVersion: this.#protocolVersion,
          succeeded,
          operationCounts: { ...cycle.operationCounts },
          failedProjects: [...cycle.failedProjects]
        });
        if (payload.iterationId === undefined) {
          this.#legacyIterationId++;
        }
        cycle.watchCompleted = true;
        this.#pruneCompletedWatchCycles();
        break;
      }
      case 'messageEmitted': {
        const payload: { severity?: string; text?: string } = event.payload as {
          severity?: string;
          text?: string;
        };
        if (payload.severity === 'error' && payload.text) {
          this.#fallbackErrorCount++;
          if (
            event.privacy === 'public' &&
            this.#fallbackErrorMessages.length < this.#maxDetailedDiagnostics
          ) {
            this.#fallbackErrorMessages.push(payload.text.trim());
          } else {
            this.#fallbackErrorsTruncated = true;
          }
        }
        break;
      }
      case 'artifactAvailable': {
        const payload: { role?: string; path?: string; format?: string; complete?: boolean } =
          event.payload as { role?: string; path?: string; format?: string; complete?: boolean };
        if (payload.role === 'log' && payload.path !== undefined) {
          this.#logPath = payload.path;
          this.#logFormat = payload.format;
          this.#artifactComplete = payload.complete !== false;
        }
        break;
      }
      case 'commandResult': {
        const payload: { succeeded: boolean; exitCode: number } = event.payload as {
          succeeded: boolean;
          exitCode: number;
        };
        this.#pendingResult = payload;
        break;
      }
      case 'sessionCompleted': {
        if (!this.#pendingResult) {
          const exitCode: number = (event.payload as { exitCode?: number }).exitCode ?? 1;
          this.#pendingResult = { succeeded: exitCode === 0, exitCode };
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Flushes progress after the primary log reservation is known.
   *
   * @remarks
   * Before an artifact arrives, even a bounded flush can consume space needed by a later
   * individually representable log reference. Keep that progress bounded and deferred;
   * closeAsync drains it with the final result even when no artifact ever arrives.
   */
  public async flushAsync(): Promise<void> {
    if (this.#logPath !== undefined) {
      this.#flushPendingProgress();
    }
  }

  public async closeAsync(): Promise<void> {
    if (!this.#finalEmitted) {
      const result: { succeeded: boolean; exitCode: number } = this.#pendingResult ?? {
        succeeded: false,
        exitCode: 1
      };
      this.#emitFinal(result.succeeded, result.exitCode);
    }
  }

  #collectDiagnostic(event: IReporterEventEnvelope<unknown>, state: IAiDiagnosticState): void {
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
      summaryKey:
        diagnostic.summaryKey === `diagnostic.${diagnostic.code}.summary` ? undefined : diagnostic.summaryKey,
      detailKey: diagnostic.detailKey,
      context: this.#projectDiagnosticContext(diagnostic.parameters),
      remediation: diagnostic.remediation,
      causeDiagnosticIds: diagnostic.causeDiagnosticIds
    };
    if (diagnostic.severity === 'error') {
      state.errorCount++;
      state.errorCodes.add(diagnostic.code);
      if (state.errorDiagnostics.length < this.#maxDetailedDiagnostics) {
        state.errorDiagnostics.push(collected);
      } else {
        state.errorDiagnosticsTruncated = true;
      }
    } else if (diagnostic.severity === 'warning') {
      state.warningCount++;
      if (state.warningDiagnostics.length < this.#maxDetailedDiagnostics) {
        state.warningDiagnostics.push(collected);
      } else {
        state.warningDiagnosticsTruncated = true;
      }
    }
  }

  #getWatchCycle(iterationId?: number): IAiWatchCycleState {
    const resolvedIterationId: number = iterationId ?? this.#legacyIterationId;
    let cycle: IAiWatchCycleState | undefined = this.#watchCycles.get(resolvedIterationId);
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
      this.#watchCycles.set(resolvedIterationId, cycle);
    }
    this.#latestIterationId = Math.max(this.#latestIterationId, resolvedIterationId);
    this.#pruneCompletedWatchCycles();
    return cycle;
  }

  #getLatestWatchCycle(): IAiWatchCycleState {
    return this.#getWatchCycle(this.#latestIterationId);
  }

  #pruneCompletedWatchCycles(): void {
    for (const [iterationId, cycle] of this.#watchCycles) {
      if (iterationId < this.#latestIterationId && cycle.watchCompleted) {
        this.#watchCycles.delete(iterationId);
      }
    }
  }

  #projectDiagnosticContext(
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

  #orderDiagnostics(diagnostics: readonly ICollectedAiDiagnostic[]): IAiDiagnostic[] {
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

  #getFinalReserveBytes(): number {
    const minimal: IAiFinalRecord = {
      kind: 'ai.final',
      protocolVersion: this.#protocolVersion,
      result: 'succeeded',
      exitCode: Number.MIN_SAFE_INTEGER,
      scope: { failedProjects: [] },
      errorCodes: [],
      diagnosticCategoryCounts: {},
      diagnostics: [],
      errorCount: Number.MAX_SAFE_INTEGER,
      warningCount: Number.MAX_SAFE_INTEGER,
      operationCounts: {},
      ...(this.#logPath === undefined
        ? {}
        : { log: { path: this.#logPath, format: this.#logFormat, complete: false } }),
      truncated: true
    };
    return Math.max(
      Math.min(this.#maxBytes, Math.max(MIN_AI_MAX_BYTES, Math.floor(this.#maxBytes / 2))),
      Buffer.byteLength(JSON.stringify(minimal), 'utf8') + 1
    );
  }

  #writeProgressRecord(
    record: Readonly<Record<string, unknown>> & { readonly kind: IPendingAiProgress['kind'] }
  ): void {
    const line: string = `${JSON.stringify(record)}\n`;
    if (this.#logPath === undefined) {
      // Delay progress until the log reservation is known; the pending queue is itself byte-bounded.
      const bytes: number = Buffer.byteLength(line, 'utf8');
      if (this.#pendingProgressBytes + bytes <= this.#maxBytes) {
        this.#pendingProgress.push({ kind: record.kind, line });
        this.#pendingProgressBytes += bytes;
      } else {
        this.#progressTruncated = true;
      }
    } else {
      this.#writeProgressLine(line);
    }
  }

  #flushPendingProgress(): void {
    const pending: IPendingAiProgress[] = this.#pendingProgress.splice(0);
    this.#pendingProgressBytes = 0;
    for (const { kind, line } of pending) {
      // A completed result supersedes an unrendered start acknowledgement, not watch history.
      if (kind === 'ai.status' && (this.#pendingResult !== undefined || this.#finalEmitted)) {
        continue;
      }
      this.#writeProgressLine(line);
    }
  }

  #writeProgressLine(line: string): void {
    if (
      this.#writtenBytes + Buffer.byteLength(line, 'utf8') + this.#getFinalReserveBytes() <=
      this.#maxBytes
    ) {
      this.#writeLine(line);
    } else {
      this.#progressTruncated = true;
    }
  }

  #writeLine(line: string): void {
    const bytes: number = Buffer.byteLength(line, 'utf8');
    if (this.#writtenBytes + bytes > this.#maxBytes) {
      throw new Error(`AI reporter output exceeds the invocation budget of ${this.#maxBytes} bytes.`);
    }
    this.#writtenBytes += bytes;
    this.#write(line);
  }

  #emitFinal(succeeded: boolean, exitCode: number): void {
    if (this.#finalEmitted) {
      return;
    }
    this.#finalEmitted = true;

    const cycle: IAiWatchCycleState = this.#getLatestWatchCycle();
    const cycleDiagnostics: IAiDiagnosticState = cycle.diagnostics;
    const errorCountWithoutFallback: number =
      this.#globalDiagnostics.errorCount + cycleDiagnostics.errorCount;
    const suppressedSecretErrorCount: number =
      this.#globalDiagnostics.suppressedSecretErrorCount + cycleDiagnostics.suppressedSecretErrorCount;
    const suppressedSecretWarningCount: number =
      this.#globalDiagnostics.suppressedSecretWarningCount + cycleDiagnostics.suppressedSecretWarningCount;
    const warningCount: number =
      this.#globalDiagnostics.warningCount + cycleDiagnostics.warningCount + suppressedSecretWarningCount;
    const collectedErrorDiagnostics: IAiDiagnostic[] = this.#orderDiagnostics([
      ...this.#globalDiagnostics.errorDiagnostics,
      ...cycleDiagnostics.errorDiagnostics
    ]);
    const collectedWarningDiagnostics: IAiDiagnostic[] = this.#orderDiagnostics([
      ...this.#globalDiagnostics.warningDiagnostics,
      ...cycleDiagnostics.warningDiagnostics
    ]);
    const fallbackDiagnostics: IAiDiagnostic[] =
      errorCountWithoutFallback === 0
        ? this.#fallbackErrorMessages.map(
            (summary: string): IAiDiagnostic => ({
              code: 'RUSH_COMMAND_FAILED',
              category: 'command',
              severity: 'error',
              summary,
              context:
                this.#commandName === undefined ? { tool: 'rush' } : { commandName: this.#commandName },
              remediation: [
                {
                  descriptionKey: 'remediation.review-command-usage',
                  command:
                    this.#commandName !== undefined && /^[a-z][a-z0-9:-]*$/i.test(this.#commandName)
                      ? `rush ${this.#commandName} --help`
                      : 'rush --help',
                  automatedExecutionSafety: 'safe'
                }
              ]
            })
          )
        : [];
    const hasFallbackErrors: boolean = errorCountWithoutFallback === 0 && this.#fallbackErrorCount > 0;
    const errorDiagnostics: IAiDiagnostic[] = hasFallbackErrors
      ? fallbackDiagnostics
      : collectedErrorDiagnostics;
    const errorCount: number =
      errorCountWithoutFallback +
      suppressedSecretErrorCount +
      (hasFallbackErrors ? this.#fallbackErrorCount : 0);
    const errorCodes: string[] = hasFallbackErrors
      ? ['RUSH_COMMAND_FAILED']
      : [...new Set([...this.#globalDiagnostics.errorCodes, ...cycleDiagnostics.errorCodes])].sort();
    const diagnosticCategoryCounts: { [category: string]: number } = {
      ...this.#globalDiagnostics.diagnosticCategoryCounts
    };
    for (const [category, count] of Object.entries(cycleDiagnostics.diagnosticCategoryCounts)) {
      diagnosticCategoryCounts[category] = (diagnosticCategoryCounts[category] ?? 0) + count;
    }
    if (hasFallbackErrors) {
      diagnosticCategoryCounts.command = (diagnosticCategoryCounts.command ?? 0) + this.#fallbackErrorCount;
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
      protocolVersion: this.#protocolVersion,
      result: succeeded ? 'succeeded' : 'failed',
      exitCode,
      scope: { commandName: this.#commandName, failedProjects: [...cycle.failedProjects] },
      errorCodes,
      diagnosticCategoryCounts,
      diagnostics: detailedSource.slice(0, this.#maxDetailedDiagnostics),
      errorCount,
      warningCount,
      operationCounts: { ...cycle.operationCounts },
      truncated: hasFailures
        ? this.#globalDiagnostics.errorDiagnosticsTruncated ||
          cycleDiagnostics.errorDiagnosticsTruncated ||
          suppressedSecretErrorCount > 0 ||
          (hasFallbackErrors && this.#fallbackErrorsTruncated)
        : this.#globalDiagnostics.warningDiagnosticsTruncated ||
          cycleDiagnostics.warningDiagnosticsTruncated ||
          suppressedSecretWarningCount > 0
    };

    if (this.#logPath !== undefined) {
      record.log = { path: this.#logPath, format: this.#logFormat, complete: this.#artifactComplete };
    }

    this.#flushPendingProgress();
    record.truncated ||= this.#progressTruncated;
    const finalBudgetBytes: number = this.#maxBytes - this.#writtenBytes;
    const serializedBytes = (): number => Buffer.byteLength(JSON.stringify(record), 'utf8') + 1;

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
      while (serializedBytes() > finalBudgetBytes && target.get().length > 0) {
        target.set(target.get().slice(0, target.get().length - 1));
        record.truncated = true;
      }
      if (serializedBytes() <= finalBudgetBytes) {
        break;
      }
    }

    let serialized: string = JSON.stringify(record);
    if (Buffer.byteLength(serialized, 'utf8') + 1 > finalBudgetBytes) {
      record.scope = { failedProjects: [] };
      record.errorCodes = [];
      record.diagnosticCategoryCounts = {};
      record.diagnostics = [];
      record.operationCounts = {};
      record.truncated = true;
      serialized = JSON.stringify(record);
    }
    if (Buffer.byteLength(serialized, 'utf8') + 1 > finalBudgetBytes && record.log !== undefined) {
      // This can only fit by omitting an intrinsically oversized reference, even with no progress output.
      delete record.log;
      serialized = JSON.stringify(record);
    }
    if (Buffer.byteLength(serialized, 'utf8') + 1 > finalBudgetBytes) {
      throw new Error(`The minimal AI final record exceeds maxBytes=${this.#maxBytes}`);
    }
    this.#writeLine(`${serialized}\n`);
  }
}
