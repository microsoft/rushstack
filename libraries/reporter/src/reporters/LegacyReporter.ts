// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';

const HEADER_WIDTH: number = 79;
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

/**
 * The `RUSH_REPORTER` environment variable.
 *
 * @beta
 */
export const RUSH_REPORTER_ENV_VAR: 'RUSH_REPORTER' = 'RUSH_REPORTER';

/**
 * Returns `true` if the legacy reporter was requested as an emergency fallback
 * through `RUSH_REPORTER=legacy`.
 *
 * @remarks
 * The legacy reporter remains available as an emergency escape hatch for at
 * least one major release.
 *
 * @param env - the environment variables
 *
 * @beta
 */
export function isLegacyEmergencyFallbackRequested(env: Record<string, string | undefined>): boolean {
  const value: string | undefined = env[RUSH_REPORTER_ENV_VAR];
  return value !== undefined && value.trim().toLowerCase() === 'legacy';
}

interface ILegacyOperationRecord {
  readonly title: string;
  durationMs: number;
  status: string;
}

/**
 * Options for {@link LegacyReporter}.
 *
 * @beta
 */
export interface ILegacyReporterOptions {
  /**
   * The output sink.
   */
  readonly write: (text: string) => void;

  /**
   * The maximum parallelism shown in the startup line.
   */
  readonly maxParallelism?: number;
}

/**
 * Reproduces the current Rush output as a selectable, StreamCollator-style reporter.
 *
 * @remarks
 * This reporter reproduces the legacy operation headers, grouped output, and
 * success or failure summary. It is selectable with `--reporter=legacy` and is
 * the `RUSH_REPORTER=legacy` emergency fallback.
 *
 * @beta
 */
export class LegacyReporter implements IReporter {
  public readonly name: string = 'legacy';

  private readonly _write: (text: string) => void;
  private readonly _maxParallelism: number | undefined;

  private _commandName: string | undefined;
  private _total: number;
  private _ordinal: number;
  private _totalDurationMs: number;
  private readonly _registry: Map<string, string>;
  private readonly _outputBuffers: Map<string, string[]>;
  private readonly _recordsByStatus: Map<string, ILegacyOperationRecord[]>;

  public constructor(options: ILegacyReporterOptions) {
    this._write = options.write;
    this._maxParallelism = options.maxParallelism;

    this._commandName = undefined;
    this._total = 0;
    this._ordinal = 0;
    this._totalDurationMs = 0;
    this._registry = new Map();
    this._outputBuffers = new Map();
    this._recordsByStatus = new Map();
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this._commandName = (event.payload as { commandName: string }).commandName;
        this._write(`Starting "rush ${this._commandName}"\n\n`);
        if (this._maxParallelism !== undefined) {
          this._write(`Executing a maximum of ${this._maxParallelism} simultaneous processes...\n`);
        }
        break;
      }
      case 'operationRegistered': {
        const payload: { operationId: string; projectName?: string; phaseName?: string } = event.payload as {
          operationId: string;
          projectName?: string;
          phaseName?: string;
        };
        this._registry.set(payload.operationId, this._title(payload.projectName, payload.phaseName));
        this._outputBuffers.set(payload.operationId, []);
        this._total++;
        break;
      }
      case 'operationStatusChanged': {
        this._onStatusChanged(event);
        break;
      }
      case 'externalOutput': {
        const text: string = (event.payload as { text?: string }).text ?? '';
        const operationId: string | undefined = event.scope?.operationId;
        const buffer: string[] | undefined =
          operationId === undefined ? undefined : this._outputBuffers.get(operationId);
        if (buffer) {
          buffer.push(text);
        } else {
          this._write(text);
        }
        break;
      }
      case 'commandCompleted': {
        const durationMs: number | undefined = (event.payload as { durationMs?: number }).durationMs;
        if (durationMs !== undefined) {
          this._totalDurationMs = durationMs;
        }
        break;
      }
      case 'commandResult': {
        this._onResult(event.payload as { succeeded: boolean });
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
    /* no-op */
  }

  private _onStatusChanged(event: IReporterEventEnvelope<unknown>): void {
    const payload: { operationId: string; status: string; durationMs?: number } = event.payload as {
      operationId: string;
      status: string;
      durationMs?: number;
    };
    const title: string = this._registry.get(payload.operationId) ?? payload.operationId;

    if (TERMINAL_STATUSES.has(payload.status)) {
      this._ordinal++;
      this._write(`\n${this._header(title, this._ordinal, this._total)}\n`);
      const output: string = this._outputBuffers.get(payload.operationId)?.join('') ?? '';
      this._write(output);
      if (output.length > 0 && !output.endsWith('\n')) {
        this._write('\n');
      }
      this._outputBuffers.delete(payload.operationId);

      const record: ILegacyOperationRecord = {
        title,
        durationMs: payload.durationMs ?? 0,
        status: payload.status
      };
      const records: ILegacyOperationRecord[] = this._recordsByStatus.get(payload.status) ?? [];
      records.push(record);
      this._recordsByStatus.set(payload.status, records);
    }
  }

  private _onResult(payload: { succeeded: boolean }): void {
    const commandName: string = this._commandName ?? 'rush';
    if (payload.succeeded) {
      const count: number =
        (this._recordsByStatus.get('success')?.length ?? 0) +
        (this._recordsByStatus.get('successWithWarnings')?.length ?? 0);
      this._write(`\n\n${this._summaryHeader(`SUCCESS: ${count} operations`)}\n\n`);
    } else {
      const count: number = this._recordsByStatus.get('failure')?.length ?? 0;
      this._write(`\n\n${this._summaryHeader(`FAILURE: ${count} operation`)}\n\n`);
    }
    this._writeStatusGroup('skipped', 'These operations were already up to date:');
    this._writeStatusGroup('noOp', 'These operations did not define any work:');
    this._writeStatusGroup('fromCache', 'These operations were restored from the build cache:');
    this._writeStatusGroup('success', 'These operations completed successfully:');
    this._writeStatusGroup('successWithWarnings', 'These operations succeeded with warnings:');
    this._writeStatusGroup('blocked', 'These operations were blocked by dependencies that failed:');
    this._writeStatusGroup('failure', 'The following projects failed to build:');

    const suffix: string = payload.succeeded ? '' : ' ==> ERROR: Project(s) failed to build';
    this._write(`rush ${commandName} (${this._seconds(this._totalDurationMs)} seconds)${suffix}\n`);
  }

  private _writeStatusGroup(status: string, heading: string): void {
    const records: readonly ILegacyOperationRecord[] | undefined = this._recordsByStatus.get(status);
    if (!records || records.length === 0) {
      return;
    }
    this._write(`${heading}\n`);
    for (const record of records) {
      this._write(`  ${record.title}    ${this._seconds(record.durationMs)} seconds\n`);
    }
    this._write('\n');
  }

  private _title(projectName: string | undefined, phaseName: string | undefined): string {
    const project: string = projectName ?? 'unknown';
    return phaseName ? `${project} (${phaseName})` : project;
  }

  private _header(title: string, ordinal: number, total: number): string {
    const left: string = `==[ ${title} ]`;
    const right: string = `[ ${ordinal} of ${total} ]==`;
    const fill: number = Math.max(2, HEADER_WIDTH - left.length - right.length);
    return `${left}${'='.repeat(fill)}${right}`;
  }

  private _summaryHeader(label: string): string {
    const left: string = `==[ ${label} ]`;
    const fill: number = Math.max(2, HEADER_WIDTH - left.length);
    return `${left}${'='.repeat(fill)}`;
  }

  private _seconds(durationMs: number): string {
    return (durationMs / 1000).toFixed(2);
  }
}
