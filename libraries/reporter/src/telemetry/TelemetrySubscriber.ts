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
  private readonly _diagnosticCodes: Set<string>;
  private readonly _producerVersions: Set<string>;

  public constructor() {
    this._operationStatuses = new Map();
    this._diagnosticCategoryCounts = {};
    this._diagnosticCodes = new Set();
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
      if (payload.code !== undefined) {
        this._diagnosticCodes.add(payload.code);
      }
      if (payload.category !== undefined) {
        this._diagnosticCategoryCounts[payload.category] =
          (this._diagnosticCategoryCounts[payload.category] ?? 0) + 1;
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
      diagnosticCodes: [...this._diagnosticCodes].sort(),
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
