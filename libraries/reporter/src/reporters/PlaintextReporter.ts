// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import type { PlaintextVariant } from '../config/AutomaticReporterMatrix';
import { createColorizer, type IColorizer } from './InteractiveRendering';

const HEARTBEAT_INTERVAL_MS: number = 30000;
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'success',
  'successWithWarnings',
  'failure',
  'blocked',
  'skipped',
  'fromCache',
  'noOp'
]);

interface IOperationRecord {
  readonly projectName: string;
  readonly phaseName?: string;
  readonly buffer: string[];
}

/**
 * Options for {@link PlaintextReporter}.
 *
 * @beta
 */
export interface IPlaintextReporterOptions {
  /**
   * The append-only sink. Never receives cursor-movement codes.
   */
  readonly write: (text: string) => void;

  /**
   * The rendering variant. `detailed` retains StreamCollator-like operation
   * grouping for CI; `concise` is minimal. Defaults to `concise`.
   */
  readonly variant?: PlaintextVariant;

  /**
   * Whether color is enabled. Defaults to `false`.
   */
  readonly color?: boolean;

  /**
   * Returns the current time in milliseconds. Injectable for testing.
   */
  readonly nowMs?: () => number;

  /**
   * The heartbeat interval in milliseconds. Defaults to 30000.
   */
  readonly heartbeatIntervalMs?: number;
}

/**
 * An append-only reporter for non-TTY and CI environments.
 *
 * @remarks
 * The reporter never moves the cursor and disables color by default. It emits
 * the start line, meaningful state changes, diagnostics, and the final result.
 * Long sessions can emit a compact heartbeat every 30 seconds. In the detailed
 * CI variant it groups each operation's output under a header, retaining
 * StreamCollator-like grouping.
 *
 * @beta
 */
export class PlaintextReporter implements IReporter {
  public readonly name: string = 'plaintext';

  readonly #write: (text: string) => void;
  readonly #variant: PlaintextVariant;
  readonly #color: IColorizer;
  readonly #nowMs: () => number;
  readonly #heartbeatIntervalMs: number;

  #commandName: string | undefined;
  #total: number;
  #completed: number;
  #failed: number;
  #lastOutputMs: number;
  #atLineStart: boolean;
  readonly #operations: Map<string, IOperationRecord>;

  public constructor(options: IPlaintextReporterOptions) {
    this.#write = options.write;
    this.#variant = options.variant ?? 'concise';
    this.#color = createColorizer(options.color ?? false);
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;

    this.#commandName = undefined;
    this.#total = 0;
    this.#completed = 0;
    this.#failed = 0;
    this.#lastOutputMs = 0;
    this.#atLineStart = true;
    this.#operations = new Map();
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName: string }).commandName;
        this.#writeLine(`Starting "rush ${this.#commandName}"`);
        break;
      }
      case 'operationRegistered': {
        const payload: { operationId: string; projectName?: string; phaseName?: string } = event.payload as {
          operationId: string;
          projectName?: string;
          phaseName?: string;
        };
        this.#operations.set(payload.operationId, {
          projectName: payload.projectName ?? payload.operationId,
          phaseName: payload.phaseName,
          buffer: []
        });
        this.#total++;
        break;
      }
      case 'operationStatusChanged': {
        this.#onStatusChanged(event);
        break;
      }
      case 'externalOutput': {
        this.#onExternalOutput(event);
        break;
      }
      case 'diagnosticEmitted': {
        const payload: { code?: string; severity?: string } = event.payload as {
          code?: string;
          severity?: string;
        };
        if (payload.severity === 'error' || payload.severity === 'warning') {
          this.#writeLine(this.#formatDiagnostic(payload.severity, payload.code ?? 'unknown'));
        }
        break;
      }
      case 'watchCycleCompleted': {
        const succeeded: boolean = (event.payload as { succeeded?: boolean }).succeeded === true;
        this.#writeLine(`Watch cycle ${succeeded ? 'succeeded' : 'failed'}`);
        break;
      }
      case 'commandResult': {
        this.#onResult(event.payload as { commandName: string; succeeded: boolean; exitCode: number });
        break;
      }
      default:
        break;
    }
  }

  public async flushAsync(): Promise<void> {
    /* Append-only output is written eagerly. */
  }

  public async closeAsync(): Promise<void> {
    /* no-op */
  }

  /**
   * Emits a compact heartbeat if the heartbeat interval has elapsed since the
   * last output. Returns whether a heartbeat was emitted.
   */
  public emitHeartbeatIfDue(): boolean {
    if (this.#nowMs() - this.#lastOutputMs >= this.#heartbeatIntervalMs) {
      this.#writeLine(
        `... ${this.#commandName ?? 'rush'} still running — ${this.#completed}/${this.#total} operations`
      );
      return true;
    }
    return false;
  }

  #onStatusChanged(event: IReporterEventEnvelope<unknown>): void {
    const payload: { operationId: string; status: string } = event.payload as {
      operationId: string;
      status: string;
    };
    const record: IOperationRecord | undefined = this.#operations.get(payload.operationId);
    const projectName: string = record?.projectName ?? event.scope?.projectName ?? payload.operationId;

    if (!TERMINAL_STATUSES.has(payload.status)) {
      return;
    }

    this.#completed++;
    if (payload.status === 'failure') {
      this.#failed++;
    }

    if (this.#variant === 'detailed') {
      const phase: string = record?.phaseName ? ` (${record.phaseName})` : '';
      this.#writeLine('');
      this.#writeLine(`==[ ${projectName}${phase} ]==`);
      if (record) {
        this.#writeRaw(record.buffer.join(''));
        record.buffer.length = 0;
      }
      this.#writeLine(this.#formatStatus(projectName, payload.status));
    } else {
      this.#writeLine(this.#formatStatus(projectName, payload.status));
    }
    this.#operations.delete(payload.operationId);
  }

  #onExternalOutput(event: IReporterEventEnvelope<unknown>): void {
    if (this.#variant !== 'detailed') {
      return;
    }
    const operationId: string | undefined = event.scope?.operationId;
    const text: string = (event.payload as { text?: string }).text ?? '';
    const record: IOperationRecord | undefined =
      operationId !== undefined ? this.#operations.get(operationId) : undefined;
    if (record) {
      record.buffer.push(text);
    } else {
      this.#writeRaw(text);
    }
  }

  #onResult(payload: { commandName: string; succeeded: boolean; exitCode: number }): void {
    const commandName: string = payload.commandName ?? this.#commandName ?? 'rush';
    if (payload.succeeded) {
      this.#writeLine(
        this.#color.green(
          `rush ${commandName} succeeded (${this.#completed}/${this.#total} operations, ${this.#failed} failed)`
        )
      );
    } else {
      this.#writeLine(this.#color.red(`rush ${commandName} failed (${this.#failed} failed)`));
    }
  }

  #formatStatus(projectName: string, status: string): string {
    const line: string = `${projectName}: ${status}`;
    if (status === 'failure') {
      return this.#color.red(line);
    }
    return line;
  }

  #formatDiagnostic(severity: string, code: string): string {
    const line: string = `[${severity}] ${code}`;
    if (severity === 'error') {
      return this.#color.red(line);
    }
    if (severity === 'warning') {
      return this.#color.yellow(line);
    }
    return line;
  }

  #writeLine(text: string): void {
    if (!this.#atLineStart) {
      this.#write('\n');
    }
    this.#write(`${text}\n`);
    this.#atLineStart = true;
    this.#lastOutputMs = this.#nowMs();
  }

  #writeRaw(text: string): void {
    this.#write(text);
    if (text.length > 0) {
      this.#atLineStart = text.endsWith('\n');
    }
    this.#lastOutputMs = this.#nowMs();
  }
}
