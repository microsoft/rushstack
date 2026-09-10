// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import type { IOperationStatusChangedPayload } from '../lifecycle/LifecycleEvents';
import type { ITelemetryAggregate, TelemetryResult } from './TelemetryAggregate';

/**
 * Consumes canonical events and produces the allowlisted telemetry aggregate.
 *
 * @remarks
 * The subscriber runs before reporter filtering, so it observes every event. It
 * extracts only allowlisted values: from a diagnostic it keeps the code and
 * category but never the parameters, remediation, or templates; it ignores
 * messages, raw external output, and command arguments entirely.
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
  readonly #diagnosticCodes: Set<string>;
  readonly #producerVersions: Set<string>;

  public constructor() {
    this.#operationStatuses = new Map();
    this.#diagnosticCategoryCounts = {};
    this.#diagnosticCodes = new Set();
    this.#producerVersions = new Set();
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
    this.#protocolVersion = event.protocolVersion;
    this.#producerVersions.add(`${event.source.packageName}@${event.source.packageVersion}`);

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
      case 'diagnosticEmitted': {
        // Keeps only the code and category, never parameters, remediation, or templates.
        const payload: { code?: string; category?: string } = event.payload as {
          code?: string;
          category?: string;
        };
        if (payload.code !== undefined) {
          this.#diagnosticCodes.add(payload.code);
        }
        if (payload.category !== undefined) {
          this.#diagnosticCategoryCounts[payload.category] =
            (this.#diagnosticCategoryCounts[payload.category] ?? 0) + 1;
        }
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
      diagnosticCodes: [...this.#diagnosticCodes].sort(),
      diagnosticCategoryCounts: { ...this.#diagnosticCategoryCounts },
      producerVersions: [...this.#producerVersions].sort()
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
