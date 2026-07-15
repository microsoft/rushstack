// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import type { IRushRemediationAction } from '../diagnostics/IRushRemediationAction';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';

const DEFAULT_AI_MAX_BYTES: number = 64 * 1024;
const DEFAULT_AI_MAX_DETAILED_DIAGNOSTICS: number = 20;
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

  private readonly _write: (text: string) => void;
  private readonly _maxBytes: number;
  private readonly _maxDetailedDiagnostics: number;

  private _protocolVersion: IReporterProtocolVersion;
  private _commandName: string | undefined;
  private readonly _projectByOperation: Map<string, string>;
  private readonly _operationCounts: { [status: string]: number };
  private readonly _failedProjects: string[];
  private readonly _errorDiagnostics: IAiDiagnostic[];
  private readonly _warningDiagnostics: IAiDiagnostic[];
  private readonly _diagnosticCategoryCounts: { [category: string]: number };
  private _errorCount: number;
  private _warningCount: number;
  private _logPath: string | undefined;
  private _logFormat: string | undefined;
  private _artifactComplete: boolean;
  private _finalEmitted: boolean;

  public constructor(options: IAiReporterOptions) {
    this._write = options.write;
    this._maxBytes = options.maxBytes ?? DEFAULT_AI_MAX_BYTES;
    this._maxDetailedDiagnostics = options.maxDetailedDiagnostics ?? DEFAULT_AI_MAX_DETAILED_DIAGNOSTICS;

    this._protocolVersion = REPORTER_PROTOCOL_VERSION;
    this._commandName = undefined;
    this._projectByOperation = new Map();
    this._operationCounts = {};
    this._failedProjects = [];
    this._errorDiagnostics = [];
    this._warningDiagnostics = [];
    this._diagnosticCategoryCounts = {};
    this._errorCount = 0;
    this._warningCount = 0;
    this._logPath = undefined;
    this._logFormat = undefined;
    this._artifactComplete = true;
    this._finalEmitted = false;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this._protocolVersion = event.protocolVersion;
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
        const payload: { operationId: string; projectName?: string } = event.payload as {
          operationId: string;
          projectName?: string;
        };
        if (payload.projectName !== undefined) {
          this._projectByOperation.set(payload.operationId, payload.projectName);
        }
        break;
      }
      case 'operationStatusChanged': {
        const payload: { operationId: string; status: string } = event.payload as {
          operationId: string;
          status: string;
        };
        if (TERMINAL_STATUSES.has(payload.status)) {
          this._operationCounts[payload.status] = (this._operationCounts[payload.status] ?? 0) + 1;
          if (payload.status === 'failure') {
            const projectName: string =
              this._projectByOperation.get(payload.operationId) ??
              event.scope?.projectName ??
              payload.operationId;
            this._failedProjects.push(projectName);
          }
        }
        break;
      }
      case 'diagnosticEmitted': {
        this._collectDiagnostic(event.payload as IAiDiagnostic);
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
        this._emitFinal(payload.succeeded, payload.exitCode);
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
      this._emitFinal(this._errorCount === 0, this._errorCount === 0 ? 0 : 1);
    }
  }

  private _collectDiagnostic(diagnostic: IAiDiagnostic): void {
    if (diagnostic.category !== undefined) {
      this._diagnosticCategoryCounts[diagnostic.category] =
        (this._diagnosticCategoryCounts[diagnostic.category] ?? 0) + 1;
    }
    if (diagnostic.severity === 'error') {
      this._errorCount++;
      this._errorDiagnostics.push({
        code: diagnostic.code,
        category: diagnostic.category,
        severity: 'error',
        remediation: diagnostic.remediation
      });
    } else if (diagnostic.severity === 'warning') {
      this._warningCount++;
      this._warningDiagnostics.push({
        code: diagnostic.code,
        category: diagnostic.category,
        severity: 'warning',
        remediation: diagnostic.remediation
      });
    }
  }

  private _emitFinal(succeeded: boolean, exitCode: number): void {
    if (this._finalEmitted) {
      return;
    }
    this._finalEmitted = true;

    const hasFailures: boolean = !succeeded || this._errorCount > 0;
    // When failures exist, warnings are represented by counts only. Warning-only
    // success may include bounded warning details.
    const detailedSource: IAiDiagnostic[] = hasFailures ? this._errorDiagnostics : this._warningDiagnostics;

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
      scope: { commandName: this._commandName, failedProjects: [...this._failedProjects] },
      errorCodes: [...new Set(this._errorDiagnostics.map((d: IAiDiagnostic) => d.code))].sort(),
      diagnosticCategoryCounts: { ...this._diagnosticCategoryCounts },
      diagnostics: detailedSource.slice(0, this._maxDetailedDiagnostics),
      errorCount: this._errorCount,
      warningCount: this._warningCount,
      operationCounts: { ...this._operationCounts },
      truncated: detailedSource.length > this._maxDetailedDiagnostics
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

    this._write(`${JSON.stringify(record)}\n`);
  }
}
