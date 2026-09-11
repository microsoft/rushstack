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

  readonly #write: (text: string) => void;
  readonly #maxParallelism: number | undefined;

  #commandName: string | undefined;
  #total: number;
  #ordinal: number;
  #totalDurationMs: number;
  readonly #registry: Map<string, string>;
  readonly #outputBuffers: Map<string, string[]>;
  readonly #recordsByStatus: Map<string, ILegacyOperationRecord[]>;

  public constructor(options: ILegacyReporterOptions) {
    this.#write = options.write;
    this.#maxParallelism = options.maxParallelism;

    this.#commandName = undefined;
    this.#total = 0;
    this.#ordinal = 0;
    this.#totalDurationMs = 0;
    this.#registry = new Map();
    this.#outputBuffers = new Map();
    this.#recordsByStatus = new Map();
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName: string }).commandName;
        this.#write(`Starting "rush ${this.#commandName}"\n\n`);
        if (this.#maxParallelism !== undefined) {
          this.#write(`Executing a maximum of ${this.#maxParallelism} simultaneous processes...\n`);
        }
        break;
      }
      case 'operationRegistered': {
        const payload: { operationId: string; projectName?: string; phaseName?: string } = event.payload as {
          operationId: string;
          projectName?: string;
          phaseName?: string;
        };
        this.#registry.set(payload.operationId, this.#title(payload.projectName, payload.phaseName));
        this.#outputBuffers.set(payload.operationId, []);
        this.#total++;
        break;
      }
      case 'operationStatusChanged': {
        this.#onStatusChanged(event);
        break;
      }
      case 'externalOutput': {
        const text: string = (event.payload as { text?: string }).text ?? '';
        const operationId: string | undefined = event.scope?.operationId;
        const buffer: string[] | undefined =
          operationId === undefined ? undefined : this.#outputBuffers.get(operationId);
        if (buffer) {
          buffer.push(text);
        } else {
          this.#write(text);
        }
        break;
      }
      case 'commandCompleted': {
        const durationMs: number | undefined = (event.payload as { durationMs?: number }).durationMs;
        if (durationMs !== undefined) {
          this.#totalDurationMs = durationMs;
        }
        break;
      }
      case 'commandResult': {
        this.#onResult(event.payload as { succeeded: boolean });
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

  #onStatusChanged(event: IReporterEventEnvelope<unknown>): void {
    const payload: { operationId: string; status: string; durationMs?: number } = event.payload as {
      operationId: string;
      status: string;
      durationMs?: number;
    };
    const title: string = this.#registry.get(payload.operationId) ?? payload.operationId;

    if (TERMINAL_STATUSES.has(payload.status)) {
      this.#ordinal++;
      this.#write(`\n${this.#header(title, this.#ordinal, this.#total)}\n`);
      const output: string = this.#outputBuffers.get(payload.operationId)?.join('') ?? '';
      this.#write(output);
      if (output.length > 0 && !output.endsWith('\n')) {
        this.#write('\n');
      }
      this.#outputBuffers.delete(payload.operationId);

      const record: ILegacyOperationRecord = {
        title,
        durationMs: payload.durationMs ?? 0,
        status: payload.status
      };
      const records: ILegacyOperationRecord[] = this.#recordsByStatus.get(payload.status) ?? [];
      records.push(record);
      this.#recordsByStatus.set(payload.status, records);
    }
  }

  #onResult(payload: { succeeded: boolean }): void {
    const commandName: string = this.#commandName ?? 'rush';
    if (payload.succeeded) {
      const count: number =
        (this.#recordsByStatus.get('success')?.length ?? 0) +
        (this.#recordsByStatus.get('successWithWarnings')?.length ?? 0);
      this.#write(`\n\n${this.#summaryHeader(`SUCCESS: ${count} operations`)}\n\n`);
    } else {
      const count: number = this.#recordsByStatus.get('failure')?.length ?? 0;
      this.#write(`\n\n${this.#summaryHeader(`FAILURE: ${count} operation`)}\n\n`);
    }
    this.#writeStatusGroup('skipped', 'These operations were already up to date:');
    this.#writeStatusGroup('noOp', 'These operations did not define any work:');
    this.#writeStatusGroup('fromCache', 'These operations were restored from the build cache:');
    this.#writeStatusGroup('success', 'These operations completed successfully:');
    this.#writeStatusGroup('successWithWarnings', 'These operations succeeded with warnings:');
    this.#writeStatusGroup('blocked', 'These operations were blocked by dependencies that failed:');
    this.#writeStatusGroup('failure', 'The following projects failed to build:');

    const suffix: string = payload.succeeded ? '' : ' ==> ERROR: Project(s) failed to build';
    this.#write(`rush ${commandName} (${this.#seconds(this.#totalDurationMs)} seconds)${suffix}\n`);
  }

  #writeStatusGroup(status: string, heading: string): void {
    const records: readonly ILegacyOperationRecord[] | undefined = this.#recordsByStatus.get(status);
    if (!records || records.length === 0) {
      return;
    }
    this.#write(`${heading}\n`);
    for (const record of records) {
      this.#write(`  ${record.title}    ${this.#seconds(record.durationMs)} seconds\n`);
    }
    this.#write('\n');
  }

  #title(projectName: string | undefined, phaseName: string | undefined): string {
    const project: string = projectName ?? 'unknown';
    return phaseName ? `${project} (${phaseName})` : project;
  }

  #header(title: string, ordinal: number, total: number): string {
    const left: string = `==[ ${title} ]`;
    const right: string = `[ ${ordinal} of ${total} ]==`;
    const fill: number = Math.max(2, HEADER_WIDTH - left.length - right.length);
    return `${left}${'='.repeat(fill)}${right}`;
  }

  #summaryHeader(label: string): string {
    const left: string = `==[ ${label} ]`;
    const fill: number = Math.max(2, HEADER_WIDTH - left.length);
    return `${left}${'='.repeat(fill)}`;
  }

  #seconds(durationMs: number): string {
    return (durationMs / 1000).toFixed(2);
  }
}
