// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import type { IRushRemediationAction } from '../diagnostics/IRushRemediationAction';
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
  'noOp'
]);

/**
 * A bounded diagnostic in an AI record.
 *
 * @beta
 */
export interface IAiDiagnostic {
  readonly code: string;
  readonly category: string;
  readonly severity: string;
  readonly remediation?: readonly IRushRemediationAction[];
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

  readonly #write: (text: string) => void;
  readonly #maxBytes: number;
  readonly #maxDetailedDiagnostics: number;

  #protocolVersion: IReporterProtocolVersion;
  #commandName: string | undefined;
  readonly #projectByOperation: Map<string, string>;
  readonly #operationCounts: { [status: string]: number };
  readonly #failedProjects: string[];
  readonly #errorDiagnostics: IAiDiagnostic[];
  readonly #warningDiagnostics: IAiDiagnostic[];
  readonly #errorCodes: Set<string>;
  readonly #diagnosticCategoryCounts: { [category: string]: number };
  #errorDiagnosticsTruncated: boolean;
  #warningDiagnosticsTruncated: boolean;
  #errorCount: number;
  #warningCount: number;
  #logPath: string | undefined;
  #logFormat: string | undefined;
  #artifactComplete: boolean;
  #finalEmitted: boolean;

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
    this.#projectByOperation = new Map();
    this.#operationCounts = {};
    this.#failedProjects = [];
    this.#errorDiagnostics = [];
    this.#warningDiagnostics = [];
    this.#errorCodes = new Set();
    this.#diagnosticCategoryCounts = {};
    this.#errorDiagnosticsTruncated = false;
    this.#warningDiagnosticsTruncated = false;
    this.#errorCount = 0;
    this.#warningCount = 0;
    this.#logPath = undefined;
    this.#logFormat = undefined;
    this.#artifactComplete = true;
    this.#finalEmitted = false;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.#protocolVersion = event.protocolVersion;
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName: string }).commandName;
        this.#write(
          `${JSON.stringify({
            kind: 'ai.status',
            protocolVersion: this.#protocolVersion,
            commandName: this.#commandName
          })}\n`
        );
        break;
      }
      case 'operationRegistered': {
        const payload: { operationId: string; projectName?: string } = event.payload as {
          operationId: string;
          projectName?: string;
        };
        if (payload.projectName !== undefined) {
          this.#projectByOperation.set(payload.operationId, payload.projectName);
        }
        break;
      }
      case 'operationStatusChanged': {
        const payload: { operationId: string; status: string } = event.payload as {
          operationId: string;
          status: string;
        };
        if (TERMINAL_STATUSES.has(payload.status)) {
          this.#operationCounts[payload.status] = (this.#operationCounts[payload.status] ?? 0) + 1;
          if (payload.status === 'failure') {
            const projectName: string =
              this.#projectByOperation.get(payload.operationId) ??
              event.scope?.projectName ??
              payload.operationId;
            this.#failedProjects.push(projectName);
          }
        }
        break;
      }
      case 'diagnosticEmitted': {
        this.#collectDiagnostic(event.payload as IAiDiagnostic);
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
        this.#emitFinal(payload.succeeded, payload.exitCode);
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
    if (!this.#finalEmitted) {
      this.#emitFinal(false, 1);
    }
  }

  #collectDiagnostic(diagnostic: IAiDiagnostic): void {
    if (diagnostic.category !== undefined) {
      this.#diagnosticCategoryCounts[diagnostic.category] =
        (this.#diagnosticCategoryCounts[diagnostic.category] ?? 0) + 1;
    }
    if (diagnostic.severity === 'error') {
      this.#errorCount++;
      this.#errorCodes.add(diagnostic.code);
      if (this.#errorDiagnostics.length < this.#maxDetailedDiagnostics) {
        this.#errorDiagnostics.push({
          code: diagnostic.code,
          category: diagnostic.category,
          severity: 'error',
          remediation: diagnostic.remediation
        });
      } else {
        this.#errorDiagnosticsTruncated = true;
      }
    } else if (diagnostic.severity === 'warning') {
      this.#warningCount++;
      if (this.#warningDiagnostics.length < this.#maxDetailedDiagnostics) {
        this.#warningDiagnostics.push({
          code: diagnostic.code,
          category: diagnostic.category,
          severity: 'warning',
          remediation: diagnostic.remediation
        });
      } else {
        this.#warningDiagnosticsTruncated = true;
      }
    }
  }

  #emitFinal(succeeded: boolean, exitCode: number): void {
    if (this.#finalEmitted) {
      return;
    }
    this.#finalEmitted = true;

    const hasFailures: boolean = !succeeded || this.#errorCount > 0;
    // When failures exist, warnings are represented by counts only. Warning-only
    // success may include bounded warning details.
    const detailedSource: IAiDiagnostic[] = hasFailures ? this.#errorDiagnostics : this.#warningDiagnostics;

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
      scope: { commandName: this.#commandName, failedProjects: [...this.#failedProjects] },
      errorCodes: [...this.#errorCodes].sort(),
      diagnosticCategoryCounts: { ...this.#diagnosticCategoryCounts },
      diagnostics: detailedSource.slice(0, this.#maxDetailedDiagnostics),
      errorCount: this.#errorCount,
      warningCount: this.#warningCount,
      operationCounts: { ...this.#operationCounts },
      truncated: hasFailures ? this.#errorDiagnosticsTruncated : this.#warningDiagnosticsTruncated
    };

    if (this.#logPath !== undefined) {
      record.log = { path: this.#logPath, format: this.#logFormat, complete: this.#artifactComplete };
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
      while (Buffer.byteLength(JSON.stringify(record), 'utf8') > this.#maxBytes && target.get().length > 0) {
        target.set(target.get().slice(0, target.get().length - 1));
        record.truncated = true;
      }
      if (Buffer.byteLength(JSON.stringify(record), 'utf8') <= this.#maxBytes) {
        break;
      }
    }

    let serialized: string = JSON.stringify(record);
    if (Buffer.byteLength(serialized, 'utf8') > this.#maxBytes) {
      record.scope = { failedProjects: [] };
      record.errorCodes = [];
      record.diagnosticCategoryCounts = {};
      record.diagnostics = [];
      record.operationCounts = {};
      delete record.log;
      record.truncated = true;
      serialized = JSON.stringify(record);
    }
    if (Buffer.byteLength(serialized, 'utf8') > this.#maxBytes) {
      throw new Error(`The minimal AI final record exceeds maxBytes=${this.#maxBytes}`);
    }
    this.#write(`${serialized}\n`);
  }
}
