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
const MAX_TELEMETRY_DIAGNOSTIC_CODE_LENGTH: number = 256;
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
 * non-public even when its envelope floor is `public`. The fallback for
 * non-public diagnostics keeps only a registered code and its registry category
 * when the envelope is `local-sensitive`, never parameters, remediation, or
 * templates. Secret envelopes contribute no values. Diagnostic codes over 256
 * characters are omitted before registry lookup or syntax validation, never
 * truncated. It ignores all other values from non-public events, messages, raw
 * external output, and command arguments entirely.
 *
 * @beta
 */
export class TelemetrySubscriber {
  #commandName: string | undefined;
  #result: TelemetryResult | undefined;
  #exitCode: number | undefined;
  #durationMs: number | undefined;
  #reporterMode: string | undefined;
  #protocolVersion: IReporterProtocolVersion | undefined;
  readonly #operationStatuses: Map<string, IOperationStatusChangedPayload['status']>;
  readonly #diagnosticCategoryCounts: { [category: string]: number };
  readonly #diagnosticCodes: Map<string, boolean>;
  readonly #producerVersions: Map<string, boolean>;

  public constructor() {
    this.#operationStatuses = new Map();
    this.#diagnosticCategoryCounts = {};
    this.#diagnosticCodes = new Map();
    this.#producerVersions = new Map();
  }

  /**
   * Records the selected reporter mode.
   */
  public setReporterMode(reporterMode: string): void {
    this.#reporterMode = reporterMode;
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
        this.#protocolVersion = event.protocolVersion;
      }
      this.#recordProducerVersion(
        event.source.packageName,
        event.source.packageVersion,
        event.parentSessionId === undefined
      );
    }

    if (event.type === 'diagnosticEmitted') {
      // Only registered schema fields are allowlisted for local-sensitive diagnostics.
      const payload: { code?: unknown; category?: unknown } = isRecord(event.payload) ? event.payload : {};
      const code: string | undefined =
        typeof payload.code === 'string' && payload.code.length <= MAX_TELEMETRY_DIAGNOSTIC_CODE_LENGTH
          ? payload.code
          : undefined;
      const registeredDefinition: IRushDiagnosticCodeDefinition | undefined =
        code === undefined ? undefined : REGISTERED_DIAGNOSTIC_CODE_DEFINITIONS.get(code);
      if (isEffectivelyPublicEnvelope) {
        if (code !== undefined && isValidRushDiagnosticCode(code)) {
          this.#recordDiagnosticCode(code, registeredDefinition !== undefined);
        }
        if (typeof payload.category === 'string') {
          this.#recordDiagnosticCategory(
            KNOWN_DIAGNOSTIC_CATEGORIES.has(payload.category) ? payload.category : OTHER_DIAGNOSTIC_CATEGORY
          );
        }
      } else if (event.privacy === 'local-sensitive' && registeredDefinition !== undefined) {
        this.#recordDiagnosticCode(registeredDefinition.code, true);
        this.#recordDiagnosticCategory(registeredDefinition.category);
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
        this.#commandName = (event.payload as { commandName: string }).commandName;
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
        this.#commandName = payload.commandName;
        this.#result = payload.succeeded ? 'succeeded' : 'failed';
        this.#exitCode = payload.exitCode;
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
        this.#commandName = payload.commandName;
        this.#exitCode = payload.exitCode;
        this.#result = payload.exitCode === 0 ? 'succeeded' : 'failed';
        if (payload.durationMs !== undefined) {
          this.#durationMs = payload.durationMs;
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
        this.#exitCode = payload.exitCode;
        this.#result = payload.exitCode === 0 ? 'succeeded' : 'failed';
        if (payload.durationMs !== undefined) {
          this.#durationMs = payload.durationMs;
        }
        break;
      }
      case 'operationStatusChanged': {
        if (event.parentSessionId !== undefined) {
          break;
        }
        const payload: IOperationStatusChangedPayload = event.payload as IOperationStatusChangedPayload;
        this.#operationStatuses.set(payload.operationId, payload.status);
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
    for (const status of this.#operationStatuses.values()) {
      operationStatusCounts[status] = (operationStatusCounts[status] ?? 0) + 1;
    }
    const diagnosticCategoryCounts: { [category: string]: number } = {};
    for (const category of Object.keys(this.#diagnosticCategoryCounts).sort()) {
      diagnosticCategoryCounts[category] = this.#diagnosticCategoryCounts[category];
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
      diagnosticCodes: [...this.#diagnosticCodes.keys()].sort(),
      diagnosticCategoryCounts,
      producerVersions: [...this.#producerVersions.keys()].sort()
    };

    if (this.#commandName !== undefined) {
      aggregate.commandName = this.#commandName;
    }
    if (this.#result !== undefined) {
      aggregate.result = this.#result;
    }
    if (this.#exitCode !== undefined) {
      aggregate.exitCode = this.#exitCode;
    }
    if (this.#durationMs !== undefined) {
      aggregate.durationMs = this.#durationMs;
    }
    if (this.#reporterMode !== undefined) {
      aggregate.reporterMode = this.#reporterMode;
    }
    if (this.#protocolVersion !== undefined) {
      aggregate.protocolVersion = this.#protocolVersion;
    }

    return aggregate;
  }

  #recordDiagnosticCode(code: string, registered: boolean): void {
    recordBoundedPrioritizedValue(
      this.#diagnosticCodes,
      code,
      registered,
      REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCodes
    );
  }

  #recordDiagnosticCategory(category: string): void {
    const existingCount: number | undefined = this.#diagnosticCategoryCounts[category];
    if (existingCount !== undefined) {
      this.#diagnosticCategoryCounts[category] = existingCount + 1;
      return;
    }
    if (
      Object.keys(this.#diagnosticCategoryCounts).length <
      REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCategories
    ) {
      this.#diagnosticCategoryCounts[category] = 1;
    }
  }

  #recordProducerVersion(
    packageName: string,
    packageVersion: string,
    isParentSessionProducer: boolean
  ): void {
    const producerVersion: string = `${packageName}@${packageVersion}`;
    if (producerVersion.length > REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersionLength) {
      return;
    }
    recordBoundedPrioritizedValue(
      this.#producerVersions,
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
