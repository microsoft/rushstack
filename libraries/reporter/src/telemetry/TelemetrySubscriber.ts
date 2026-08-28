// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import type { IOperationStatusChangedPayload } from '../lifecycle/LifecycleEvents';
import {
  isValidRushDiagnosticCode,
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS,
  type IRushDiagnosticCodeDefinition
} from '../diagnostics/RushDiagnosticCodeRegistry';
import { REPORTER_PERFORMANCE_BUDGETS } from '../perf/PerformanceBudgets';
import type { ITelemetryAggregate, TelemetryResult } from './TelemetryAggregate';

const OTHER_DIAGNOSTIC_CATEGORY: 'other' = 'other';
const KNOWN_DIAGNOSTIC_CATEGORIES: ReadonlySet<string> = new Set(
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS.map(
    (definition: IRushDiagnosticCodeDefinition): string => definition.category
  )
);

function compareDiagnosticCodeCandidates(
  left: readonly [code: string, registered: boolean],
  right: readonly [code: string, registered: boolean]
): number {
  if (left[1] !== right[1]) {
    return left[1] ? -1 : 1;
  }
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

/**
 * Consumes canonical events and produces the allowlisted telemetry aggregate.
 *
 * @remarks
 * The subscriber runs before reporter filtering, so it observes every event. It
 * projects envelope metadata and lifecycle values only from public events. From
 * a diagnostic it keeps the explicitly public code and category regardless of
 * the envelope privacy floor, but never parameters, remediation, or templates.
 * It ignores all other values from non-public events, messages, raw external
 * output, and command arguments entirely.
 *
 * @beta
 */
export class TelemetrySubscriber {
  private _commandName: string | undefined;
  private _result: TelemetryResult | undefined;
  private _exitCode: number | undefined;
  private _durationMs: number | undefined;
  private _reporterMode: string | undefined;
  private _protocolVersion: IReporterProtocolVersion | undefined;
  private readonly _operationStatuses: Map<string, IOperationStatusChangedPayload['status']>;
  private readonly _diagnosticCategoryCounts: { [category: string]: number };
  private readonly _diagnosticCodes: Map<string, boolean>;
  private readonly _producerVersions: Set<string>;

  public constructor() {
    this._operationStatuses = new Map();
    this._diagnosticCategoryCounts = {};
    this._diagnosticCodes = new Map();
    this._producerVersions = new Set();
  }

  /**
   * Records the selected reporter mode.
   */
  public setReporterMode(reporterMode: string): void {
    this._reporterMode = reporterMode;
  }

  /**
   * Ingests one event, extracting only allowlisted values.
   */
  public ingest(event: IReporterEventEnvelope<unknown>): void {
    const isPublicEnvelope: boolean = event.privacy === 'public';
    if (isPublicEnvelope) {
      this._protocolVersion = event.protocolVersion;
      this._producerVersions.add(`${event.source.packageName}@${event.source.packageVersion}`);
    }

    if (event.type === 'diagnosticEmitted') {
      // Code and category are public schema fields even when classified
      // parameters make the diagnostic envelope non-public.
      const payload: { code?: string; category?: string } = event.payload as {
        code?: string;
        category?: string;
      };
      if (typeof payload.code === 'string' && isValidRushDiagnosticCode(payload.code)) {
        const registeredDefinition: IRushDiagnosticCodeDefinition | undefined =
          RUSH_DIAGNOSTIC_CODE_DEFINITIONS.find(
            (definition: IRushDiagnosticCodeDefinition): boolean => definition.code === payload.code
          );
        if (isPublicEnvelope || registeredDefinition !== undefined) {
          this._recordDiagnosticCode(payload.code, registeredDefinition !== undefined);
        }
      }
      if (typeof payload.category === 'string') {
        this._recordDiagnosticCategory(payload.category);
      }
      return;
    }

    if (!isPublicEnvelope) {
      return;
    }

    switch (event.type) {
      case 'commandStarted': {
        if (event.parentSessionId !== undefined) {
          break;
        }
        // Deliberately ignores argv.
        this._commandName = (event.payload as { commandName: string }).commandName;
        break;
      }
      case 'commandResult': {
        if (event.parentSessionId !== undefined) {
          break;
        }
        const payload: { commandName: string; succeeded: boolean; exitCode: number } = event.payload as {
          commandName: string;
          succeeded: boolean;
          exitCode: number;
        };
        this._commandName = payload.commandName;
        this._result = payload.succeeded ? 'succeeded' : 'failed';
        this._exitCode = payload.exitCode;
        break;
      }
      case 'commandCompleted': {
        if (event.parentSessionId !== undefined) {
          break;
        }
        const payload: { commandName: string; exitCode: number; durationMs?: number } = event.payload as {
          commandName: string;
          exitCode: number;
          durationMs?: number;
        };
        this._commandName = payload.commandName;
        this._exitCode = payload.exitCode;
        this._result = payload.exitCode === 0 ? 'succeeded' : 'failed';
        if (payload.durationMs !== undefined) {
          this._durationMs = payload.durationMs;
        }
        break;
      }
      case 'sessionCompleted': {
        if (event.parentSessionId !== undefined) {
          break;
        }
        const payload: { exitCode: number; durationMs?: number } = event.payload as {
          exitCode: number;
          durationMs?: number;
        };
        this._exitCode = payload.exitCode;
        this._result = payload.exitCode === 0 ? 'succeeded' : 'failed';
        if (payload.durationMs !== undefined) {
          this._durationMs = payload.durationMs;
        }
        break;
      }
      case 'operationStatusChanged': {
        if (event.parentSessionId !== undefined) {
          break;
        }
        const payload: IOperationStatusChangedPayload = event.payload as IOperationStatusChangedPayload;
        this._operationStatuses.set(payload.operationId, payload.status);
        break;
      }
      default: {
        // Messages, raw external output, artifacts, and extension events are not
        // telemetry.
        break;
      }
    }
  }

  /**
   * Builds the allowlisted aggregate.
   */
  public buildAggregate(): ITelemetryAggregate {
    const operationStatusCounts: { [status: string]: number } = {};
    for (const status of this._operationStatuses.values()) {
      operationStatusCounts[status] = (operationStatusCounts[status] ?? 0) + 1;
    }

    const aggregate: {
      commandName?: string;
      result?: TelemetryResult;
      exitCode?: number;
      durationMs?: number;
      operationStatusCounts: { [status: string]: number };
      diagnosticCodes: string[];
      diagnosticCategoryCounts: { [category: string]: number };
      reporterMode?: string;
      protocolVersion?: IReporterProtocolVersion;
      producerVersions: string[];
    } = {
      operationStatusCounts,
      diagnosticCodes: [...this._diagnosticCodes.keys()].sort(),
      diagnosticCategoryCounts: { ...this._diagnosticCategoryCounts },
      producerVersions: [...this._producerVersions].sort()
    };

    if (this._commandName !== undefined) {
      aggregate.commandName = this._commandName;
    }
    if (this._result !== undefined) {
      aggregate.result = this._result;
    }
    if (this._exitCode !== undefined) {
      aggregate.exitCode = this._exitCode;
    }
    if (this._durationMs !== undefined) {
      aggregate.durationMs = this._durationMs;
    }
    if (this._reporterMode !== undefined) {
      aggregate.reporterMode = this._reporterMode;
    }
    if (this._protocolVersion !== undefined) {
      aggregate.protocolVersion = this._protocolVersion;
    }

    return aggregate;
  }

  private _recordDiagnosticCode(code: string, registered: boolean): void {
    const existingRegistration: boolean | undefined = this._diagnosticCodes.get(code);
    if (existingRegistration !== undefined) {
      if (registered && !existingRegistration) {
        this._diagnosticCodes.set(code, true);
      }
      return;
    }

    if (this._diagnosticCodes.size < REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCodes) {
      this._diagnosticCodes.set(code, registered);
      return;
    }

    let worstCandidate: readonly [code: string, registered: boolean] | undefined;
    for (const candidate of this._diagnosticCodes) {
      if (worstCandidate === undefined || compareDiagnosticCodeCandidates(candidate, worstCandidate) > 0) {
        worstCandidate = candidate;
      }
    }

    const newCandidate: readonly [code: string, registered: boolean] = [code, registered];
    if (worstCandidate !== undefined && compareDiagnosticCodeCandidates(newCandidate, worstCandidate) < 0) {
      this._diagnosticCodes.delete(worstCandidate[0]);
      this._diagnosticCodes.set(code, registered);
    }
  }

  private _recordDiagnosticCategory(category: string): void {
    let safeCategory: string = KNOWN_DIAGNOSTIC_CATEGORIES.has(category)
      ? category
      : OTHER_DIAGNOSTIC_CATEGORY;
    if (
      this._diagnosticCategoryCounts[safeCategory] === undefined &&
      Object.keys(this._diagnosticCategoryCounts).length >=
        REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCategories
    ) {
      safeCategory = OTHER_DIAGNOSTIC_CATEGORY;
    }
    this._diagnosticCategoryCounts[safeCategory] = (this._diagnosticCategoryCounts[safeCategory] ?? 0) + 1;
  }
}

/**
 * Wraps a telemetry subscriber as a reporter so it can be registered with the
 * manager and observe every event before reporter filtering.
 *
 * @remarks
 * The returned reporter owns no destination and renders nothing.
 *
 * @param subscriber - the telemetry subscriber to feed
 *
 * @beta
 */
export function createTelemetryReporter(subscriber: TelemetrySubscriber): IReporter {
  return {
    name: 'telemetry',
    async initializeAsync(): Promise<void> {
      /* no-op */
    },
    report(event: IReporterEventEnvelope<unknown>): void {
      subscriber.ingest(event);
    },
    async flushAsync(): Promise<void> {
      /* no-op */
    },
    async closeAsync(): Promise<void> {
      /* no-op */
    }
  };
}
