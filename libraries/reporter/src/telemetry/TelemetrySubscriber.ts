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
const REGISTERED_DIAGNOSTIC_CODE_DEFINITIONS: ReadonlyMap<string, IRushDiagnosticCodeDefinition> = new Map(
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS.map(
    (definition: IRushDiagnosticCodeDefinition): readonly [string, IRushDiagnosticCodeDefinition] => [
      definition.code,
      definition
    ]
  )
);
const KNOWN_DIAGNOSTIC_CATEGORIES: ReadonlySet<string> = new Set(
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS.map(
    (definition: IRushDiagnosticCodeDefinition): string => definition.category
  )
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDiagnosticPayloadEffectivelyPublic(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  const parameters: unknown = payload.parameters;
  if (parameters === undefined) {
    return true;
  }
  if (!isRecord(parameters)) {
    return false;
  }
  for (const parameter of Object.values(parameters)) {
    if (!isRecord(parameter) || parameter.privacy !== 'public') {
      return false;
    }
  }
  return true;
}

function comparePrioritizedCandidates(
  left: readonly [value: string, preferred: boolean],
  right: readonly [value: string, preferred: boolean]
): number {
  if (left[1] !== right[1]) {
    return left[1] ? -1 : 1;
  }
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

function recordBoundedPrioritizedValue(
  values: Map<string, boolean>,
  value: string,
  preferred: boolean,
  maximumCount: number
): void {
  const existingPriority: boolean | undefined = values.get(value);
  if (existingPriority !== undefined) {
    if (preferred && !existingPriority) {
      values.set(value, true);
    }
    return;
  }

  if (values.size < maximumCount) {
    values.set(value, preferred);
    return;
  }

  let worstCandidate: readonly [value: string, preferred: boolean] | undefined;
  for (const candidate of values) {
    if (worstCandidate === undefined || comparePrioritizedCandidates(candidate, worstCandidate) > 0) {
      worstCandidate = candidate;
    }
  }

  const newCandidate: readonly [value: string, preferred: boolean] = [value, preferred];
  if (worstCandidate !== undefined && comparePrioritizedCandidates(newCandidate, worstCandidate) < 0) {
    values.delete(worstCandidate[0]);
    values.set(value, preferred);
  }
}

/**
 * Consumes canonical events and produces the allowlisted telemetry aggregate.
 *
 * @remarks
 * The subscriber runs before reporter filtering, so it observes every event. It
 * projects envelope metadata and lifecycle values only from effectively public
 * events. A diagnostic containing any non-public parameter is treated as
 * non-public even when its envelope floor is `public`. From a non-public
 * diagnostic it keeps only a registered code and that code's registry category,
 * never parameters, remediation, or templates. It ignores all other values from
 * non-public events, messages, raw external output, and command arguments
 * entirely.
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
  private readonly _producerVersions: Map<string, boolean>;

  public constructor() {
    this._operationStatuses = new Map();
    this._diagnosticCategoryCounts = {};
    this._diagnosticCodes = new Map();
    this._producerVersions = new Map();
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
    const isEffectivelyPublicEnvelope: boolean =
      event.privacy === 'public' &&
      (event.type !== 'diagnosticEmitted' || isDiagnosticPayloadEffectivelyPublic(event.payload));
    if (isEffectivelyPublicEnvelope) {
      if (event.parentSessionId === undefined) {
        this._protocolVersion = event.protocolVersion;
      }
      this._recordProducerVersion(
        event.source.packageName,
        event.source.packageVersion,
        event.parentSessionId === undefined
      );
    }

    if (event.type === 'diagnosticEmitted') {
      // Code and category are public schema fields even when classified
      // parameters make the diagnostic envelope non-public.
      const payload: { code?: unknown; category?: unknown } = isRecord(event.payload) ? event.payload : {};
      const registeredDefinition: IRushDiagnosticCodeDefinition | undefined =
        typeof payload.code === 'string'
          ? REGISTERED_DIAGNOSTIC_CODE_DEFINITIONS.get(payload.code)
          : undefined;
      if (isEffectivelyPublicEnvelope) {
        if (typeof payload.code === 'string' && isValidRushDiagnosticCode(payload.code)) {
          this._recordDiagnosticCode(payload.code, registeredDefinition !== undefined);
        }
        if (typeof payload.category === 'string') {
          this._recordDiagnosticCategory(
            KNOWN_DIAGNOSTIC_CATEGORIES.has(payload.category) ? payload.category : OTHER_DIAGNOSTIC_CATEGORY
          );
        }
      } else if (registeredDefinition !== undefined) {
        this._recordDiagnosticCode(registeredDefinition.code, true);
        this._recordDiagnosticCategory(registeredDefinition.category);
      }
      return;
    }

    if (!isEffectivelyPublicEnvelope) {
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
    const diagnosticCategoryCounts: { [category: string]: number } = {};
    for (const category of Object.keys(this._diagnosticCategoryCounts).sort()) {
      diagnosticCategoryCounts[category] = this._diagnosticCategoryCounts[category];
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
      diagnosticCategoryCounts,
      producerVersions: [...this._producerVersions.keys()].sort()
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
    recordBoundedPrioritizedValue(
      this._diagnosticCodes,
      code,
      registered,
      REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCodes
    );
  }

  private _recordDiagnosticCategory(category: string): void {
    const existingCount: number | undefined = this._diagnosticCategoryCounts[category];
    if (existingCount !== undefined) {
      this._diagnosticCategoryCounts[category] = existingCount + 1;
      return;
    }
    if (
      Object.keys(this._diagnosticCategoryCounts).length <
      REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCategories
    ) {
      this._diagnosticCategoryCounts[category] = 1;
    }
  }

  private _recordProducerVersion(
    packageName: string,
    packageVersion: string,
    isParentSessionProducer: boolean
  ): void {
    const producerVersion: string = `${packageName}@${packageVersion}`;
    if (producerVersion.length > REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersionLength) {
      return;
    }
    recordBoundedPrioritizedValue(
      this._producerVersions,
      producerVersion,
      isParentSessionProducer,
      REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersions
    );
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
