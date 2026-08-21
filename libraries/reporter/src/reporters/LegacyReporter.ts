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
  'noOp'
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
  private readonly _completed: ILegacyOperationRecord[];
  private readonly _failed: ILegacyOperationRecord[];

  public constructor(options: ILegacyReporterOptions) {
    this._write = options.write;
    this._maxParallelism = options.maxParallelism;

    this._commandName = undefined;
    this._total = 0;
    this._ordinal = 0;
    this._totalDurationMs = 0;
    this._registry = new Map();
    this._completed = [];
    this._failed = [];
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
        this._total++;
        break;
      }
      case 'operationStatusChanged': {
        this._onStatusChanged(event);
        break;
      }
      case 'externalOutput': {
        this._write(this._ensureNewline((event.payload as { text?: string }).text ?? ''));
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

    if (payload.status === 'executing') {
      this._ordinal++;
      this._write(`\n${this._header(title, this._ordinal, this._total)}\n`);
      return;
    }

    if (TERMINAL_STATUSES.has(payload.status)) {
      const record: ILegacyOperationRecord = {
        title,
        durationMs: payload.durationMs ?? 0,
        status: payload.status
      };
      if (payload.status === 'failure') {
        this._failed.push(record);
      } else {
        this._completed.push(record);
      }
    }
  }

  private _onResult(payload: { succeeded: boolean }): void {
    const commandName: string = this._commandName ?? 'rush';
    if (payload.succeeded) {
      const count: number = this._completed.length;
      this._write(`\n\n${this._summaryHeader(`SUCCESS: ${count} operations`)}\n\n`);
      this._write('These operations completed successfully:\n');
      for (const record of this._completed) {
        this._write(`  ${record.title}    ${this._seconds(record.durationMs)} seconds\n`);
      }
      this._write(`\nrush ${commandName} (${this._seconds(this._totalDurationMs)} seconds)\n`);
    } else {
      const count: number = this._failed.length;
      this._write(`\n\n${this._summaryHeader(`FAILURE: ${count} operation`)}\n\n`);
      this._write('The following projects failed to build:\n');
      for (const record of this._failed) {
        this._write(`  ${record.title}    ${this._seconds(record.durationMs)} seconds\n`);
      }
      this._write(
        `\nrush ${commandName} (${this._seconds(this._totalDurationMs)} seconds) ==> ERROR: Project(s) failed to build\n`
      );
    }
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

  private _ensureNewline(text: string): string {
    return text.endsWith('\n') ? text : `${text}\n`;
  }
}
