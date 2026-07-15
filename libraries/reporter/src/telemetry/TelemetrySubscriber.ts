// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
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
  private _commandName: string | undefined;
  private _result: TelemetryResult | undefined;
  private _exitCode: number | undefined;
  private _durationMs: number | undefined;
  private _reporterMode: string | undefined;
  private _protocolVersion: IReporterProtocolVersion | undefined;
  private readonly _operationStatusCounts: { [status: string]: number };
  private readonly _diagnosticCategoryCounts: { [category: string]: number };
  private readonly _diagnosticCodes: Set<string>;
  private readonly _producerVersions: Set<string>;

  public constructor() {
    this._operationStatusCounts = {};
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
    this._protocolVersion = event.protocolVersion;
    this._producerVersions.add(`${event.source.packageName}@${event.source.packageVersion}`);

    switch (event.type) {
      case 'commandStarted': {
        // Deliberately ignores argv.
        this._commandName = (event.payload as { commandName: string }).commandName;
        break;
      }
      case 'commandResult': {
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
        const payload: { durationMs?: number } = event.payload as { durationMs?: number };
        if (payload.durationMs !== undefined) {
          this._durationMs = payload.durationMs;
        }
        break;
      }
      case 'sessionCompleted': {
        const payload: { exitCode: number; durationMs?: number } = event.payload as {
          exitCode: number;
          durationMs?: number;
        };
        if (this._exitCode === undefined) {
          this._exitCode = payload.exitCode;
        }
        if (payload.durationMs !== undefined) {
          this._durationMs = payload.durationMs;
        }
        break;
      }
      case 'operationStatusChanged': {
        const status: string = (event.payload as { status: string }).status;
        this._operationStatusCounts[status] = (this._operationStatusCounts[status] ?? 0) + 1;
        break;
      }
      case 'diagnosticEmitted': {
        // Keeps only the code and category, never parameters, remediation, or templates.
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
      operationStatusCounts: { ...this._operationStatusCounts },
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
