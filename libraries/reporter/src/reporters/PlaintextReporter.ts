// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import type { PlaintextVariant } from '../config/AutomaticReporterMatrix';
import type { ReporterLogLevel } from '../config/ReporterNames';
import { createColorizer, type IColorizer } from './InteractiveRendering';

const HEARTBEAT_INTERVAL_MS: number = 30000;
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

interface IOperationRecord {
  readonly projectName: string;
  readonly phaseName?: string;
  readonly silent: boolean;
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

  /**
   * The selected reporter log level. Defaults to `normal`.
   */
  readonly logLevel?: ReporterLogLevel;
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

  private readonly _write: (text: string) => void;
  private readonly _variant: PlaintextVariant;
  private readonly _color: IColorizer;
  private readonly _nowMs: () => number;
  private readonly _heartbeatIntervalMs: number;
  private readonly _logLevel: ReporterLogLevel;

  private _commandName: string | undefined;
  private _total: number;
  private _completed: number;
  private _failed: number;
  private _lastOutputMs: number;
  private _atLineStart: boolean;
  private _logPath: string | undefined;
  private readonly _operations: Map<string, IOperationRecord>;

  public constructor(options: IPlaintextReporterOptions) {
    this._write = options.write;
    this._variant = options.variant ?? 'concise';
    this._color = createColorizer(options.color ?? false);
    this._nowMs = options.nowMs ?? (() => Date.now());
    this._heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this._logLevel = options.logLevel ?? 'normal';

    this._commandName = undefined;
    this._total = 0;
    this._completed = 0;
    this._failed = 0;
    this._lastOutputMs = 0;
    this._atLineStart = true;
    this._logPath = undefined;
    this._operations = new Map();
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this._commandName = (event.payload as { commandName: string }).commandName;
        this._writeLine(`Starting "rush ${this._commandName}"`);
        break;
      }
      case 'operationRegistered': {
        const payload: {
          operationId: string;
          projectName?: string;
          phaseName?: string;
          silent?: boolean;
        } = event.payload as {
          operationId: string;
          projectName?: string;
          phaseName?: string;
          silent?: boolean;
        };
        this._operations.set(payload.operationId, {
          projectName: payload.projectName ?? payload.operationId,
          phaseName: payload.phaseName,
          silent: payload.silent === true,
          buffer: []
        });
        if (!payload.silent) {
          this._total++;
        }
        break;
      }
      case 'operationStatusChanged': {
        break;
      }
      case 'operationCompleted': {
        this._onOperationCompleted(event);
        break;
      }
      case 'externalOutput': {
        this._onExternalOutput(event);
        break;
      }
      case 'diagnosticEmitted': {
        const payload: { code?: string; severity?: string } = event.payload as {
          code?: string;
          severity?: string;
        };
        if (payload.severity === 'error' || payload.severity === 'warning') {
          this._writeLine(this._formatDiagnostic(payload.severity, payload.code ?? 'unknown'));
        }
        break;
      }
      case 'artifactAvailable': {
        const payload: { role?: string; path?: string } = event.payload as {
          role?: string;
          path?: string;
        };
        if (payload.role === 'log') {
          this._logPath = payload.path;
        }
        break;
      }
      case 'messageEmitted': {
        if (event.scope?.operationId === undefined) {
          const payload: { severity?: string; text?: string } = event.payload as {
            severity?: string;
            text?: string;
          };
          if (
            payload.text &&
            (this._logLevel !== 'quiet' || payload.severity === 'warning' || payload.severity === 'error')
          ) {
            this._writeRaw(payload.text.endsWith('\n') ? payload.text : `${payload.text}\n`);
          }
        }
        break;
      }
      case 'watchCycleCompleted': {
        const succeeded: boolean = (event.payload as { succeeded?: boolean }).succeeded === true;
        this._writeLine(`Watch cycle ${succeeded ? 'succeeded' : 'failed'}`);
        break;
      }
      case 'commandResult': {
        this._onResult(event.payload as { commandName: string; succeeded: boolean; exitCode: number });
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
    if (this._nowMs() - this._lastOutputMs >= this._heartbeatIntervalMs) {
      this._writeLine(
        `... ${this._commandName ?? 'rush'} still running — ${this._completed}/${this._total} operations`
      );
      return true;
    }
    return false;
  }

  private _onOperationCompleted(event: IReporterEventEnvelope<unknown>): void {
    const payload: { operationId: string; status: string } = event.payload as {
      operationId: string;
      status: string;
    };
    const record: IOperationRecord | undefined = this._operations.get(payload.operationId);
    const projectName: string = record?.projectName ?? event.scope?.projectName ?? payload.operationId;

    if (!TERMINAL_STATUSES.has(payload.status)) {
      return;
    }
    if (record?.silent) {
      this._operations.delete(payload.operationId);
      return;
    }

    this._completed++;
    if (payload.status === 'failure') {
      this._failed++;
    }

    if (this._logLevel === 'quiet') {
      this._operations.delete(payload.operationId);
      return;
    }

    if (this._variant === 'detailed') {
      const phase: string = record?.phaseName ? ` (${record.phaseName})` : '';
      this._writeLine('');
      this._writeLine(`==[ ${projectName}${phase} ]==`);
      if (record) {
        this._writeRaw(record.buffer.join(''));
        record.buffer.length = 0;
      }
      this._writeLine(this._formatStatus(projectName, payload.status));
    } else {
      this._writeLine(this._formatStatus(projectName, payload.status));
    }
    this._operations.delete(payload.operationId);
  }

  private _onExternalOutput(event: IReporterEventEnvelope<unknown>): void {
    if (this._variant !== 'detailed') {
      return;
    }
    const operationId: string | undefined = event.scope?.operationId;
    const text: string = (event.payload as { text?: string }).text ?? '';
    const record: IOperationRecord | undefined =
      operationId !== undefined ? this._operations.get(operationId) : undefined;
    if (record) {
      record.buffer.push(text);
    } else {
      this._writeRaw(text);
    }
  }

  private _onResult(payload: { commandName: string; succeeded: boolean; exitCode: number }): void {
    const commandName: string = payload.commandName ?? this._commandName ?? 'rush';
    if (payload.succeeded) {
      this._writeLine(
        this._color.green(
          `rush ${commandName} succeeded (${this._completed}/${this._total} operations, ${this._failed} failed)`
        )
      );
    } else {
      this._writeLine(this._color.red(`rush ${commandName} failed (${this._failed} failed)`));
    }
    if (this._logPath) {
      this._writeLine(`Full log: ${this._logPath}`);
    }
  }

  private _formatStatus(projectName: string, status: string): string {
    const line: string = `${projectName}: ${status}`;
    if (status === 'failure') {
      return this._color.red(line);
    }
    return line;
  }

  private _formatDiagnostic(severity: string, code: string): string {
    const line: string = `[${severity}] ${code}`;
    if (severity === 'error') {
      return this._color.red(line);
    }
    if (severity === 'warning') {
      return this._color.yellow(line);
    }
    return line;
  }

  private _writeLine(text: string): void {
    if (!this._atLineStart) {
      this._write('\n');
    }
    this._write(`${text}\n`);
    this._atLineStart = true;
    this._lastOutputMs = this._nowMs();
  }

  private _writeRaw(text: string): void {
    this._write(text);
    if (text.length > 0) {
      this._atLineStart = text.endsWith('\n');
    }
    this._lastOutputMs = this._nowMs();
  }
}
