// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter, IReporterContext } from '../manager/IReporter';
import { getHumanReadableMessageText } from './ReporterRedaction';
import { formatHumanReadableDiagnostic } from './HumanReadableDiagnostic';
import type { PlaintextVariant } from '../config/AutomaticReporterMatrix';
import type { ReporterLogLevel } from '../config/ReporterNames';
import { createColorizer, type IColorizer } from './InteractiveRendering';
import { writeAllSync, WriteAllSyncError } from '../utilities/writeAllSync';
import { startReporterTimer } from '../utilities/startReporterTimer';

const HEARTBEAT_INTERVAL_MS: number = 30000;
const OWNER_ONLY_MODE: number = 0o600;
const OWNER_ONLY_DIRECTORY_MODE: number = 0o700;
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
  spoolPath?: string;
  spoolFileDescriptor?: number;
  spoolFailed?: boolean;
}

interface IWatchCycleState {
  readonly operations: Map<string, IOperationRecord>;
  total: number;
  completed: number;
  failed: number;
  watchCompleted: boolean;
}

function getIterationId(payload: { iterationId?: number }, fallback: number): number {
  return payload.iterationId ?? fallback;
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

  readonly #write: (text: string) => void;
  readonly #variant: PlaintextVariant;
  readonly #color: IColorizer;
  readonly #nowMs: () => number;
  readonly #heartbeatIntervalMs: number;
  readonly #logLevel: ReporterLogLevel;

  #commandName: string | undefined;
  #lastOutputMs: number;
  #atLineStart: boolean;
  #logPath: string | undefined;
  readonly #watchCycles: Map<number, IWatchCycleState>;
  #spoolDirectory: string | undefined;
  #nextSpoolId: number;
  #legacyIterationId: number;
  #latestIterationId: number;
  #disposeHeartbeat: (() => void) | undefined;
  #abortSignal: AbortSignal | undefined;

  public constructor(options: IPlaintextReporterOptions) {
    this.#write = options.write;
    this.#variant = options.variant ?? 'concise';
    this.#color = createColorizer(options.color ?? false);
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.#logLevel = options.logLevel ?? 'normal';

    this.#commandName = undefined;
    this.#lastOutputMs = 0;
    this.#atLineStart = true;
    this.#logPath = undefined;
    this.#watchCycles = new Map();
    this.#spoolDirectory = undefined;
    this.#nextSpoolId = 1;
    this.#legacyIterationId = 0;
    this.#latestIterationId = 0;
  }

  public async initializeAsync(context?: IReporterContext): Promise<void> {
    this.#abortSignal = context?.abortSignal;
    if (!this.#disposeHeartbeat && this.#logLevel !== 'quiet') {
      this.#disposeHeartbeat = startReporterTimer(
        context,
        () => {
          if (this.#commandName !== undefined) {
            this.emitHeartbeatIfDue();
          }
        },
        Math.max(1, this.#heartbeatIntervalMs)
      );
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    switch (event.type) {
      case 'commandStarted': {
        this.#commandName = (event.payload as { commandName: string }).commandName;
        this.#writeLine(`Starting "rush ${this.#commandName}"`);
        break;
      }
      case 'operationRegistered': {
        const payload: {
          operationId: string;
          projectName?: string;
          phaseName?: string;
          silent?: boolean;
          iterationId?: number;
        } = event.payload as {
          operationId: string;
          projectName?: string;
          phaseName?: string;
          silent?: boolean;
          iterationId?: number;
        };
        const iterationId: number = getIterationId(payload, this.#legacyIterationId);
        const cycle: IWatchCycleState = this.#getWatchCycle(iterationId);
        const previousRecord: IOperationRecord | undefined = cycle.operations.get(payload.operationId);
        if (previousRecord) {
          break;
        }
        cycle.operations.set(payload.operationId, {
          projectName: payload.projectName ?? payload.operationId,
          phaseName: payload.phaseName,
          silent: payload.silent === true
        });
        if (!payload.silent) {
          cycle.total++;
        }
        break;
      }
      case 'operationStatusChanged': {
        break;
      }
      case 'operationCompleted': {
        this.#onOperationCompleted(event);
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
          this.#writeLine(this.#formatDiagnostic(payload.severity, formatHumanReadableDiagnostic(event)));
        }
        break;
      }
      case 'artifactAvailable': {
        const payload: { role?: string; path?: string } = event.payload as {
          role?: string;
          path?: string;
        };
        if (payload.role === 'log') {
          this.#logPath = payload.path;
        }
        break;
      }
      case 'messageEmitted': {
        if (event.scope?.operationId === undefined) {
          const payload: { severity?: string } = event.payload as {
            severity?: string;
          };
          const text: string | undefined = getHumanReadableMessageText(event);
          if (
            text &&
            (this.#logLevel !== 'quiet' || payload.severity === 'warning' || payload.severity === 'error')
          ) {
            this.#writeRaw(text.endsWith('\n') ? text : `${text}\n`);
          }
        }
        break;
      }
      case 'watchCycleCompleted': {
        const payload: { succeeded?: boolean; iterationId?: number } = event.payload as {
          succeeded?: boolean;
          iterationId?: number;
        };
        const iterationId: number = getIterationId(payload, this.#legacyIterationId);
        const cycle: IWatchCycleState = this.#getWatchCycle(iterationId);
        const succeeded: boolean = payload.succeeded === true;
        this.#writeLine(
          `Watch cycle ${succeeded ? 'succeeded' : 'failed'} ` +
            `(${cycle.completed}/${cycle.total} operations, ${cycle.failed} failed)`
        );
        this.#latestIterationId = Math.max(this.#latestIterationId, iterationId);
        cycle.watchCompleted = true;
        this.#pruneCompletedWatchCycles();
        if (payload.iterationId === undefined) {
          this.#legacyIterationId++;
        }
        break;
      }
      case 'commandResult': {
        this.#stopHeartbeat();
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
    this.#stopHeartbeat();
    const failed: boolean = this.#abortSignal?.aborted === true && this.#abortSignal.reason instanceof Error;
    for (const cycle of this.#watchCycles.values()) {
      for (const [operationId, record] of cycle.operations) {
        if (!failed && !record.silent && this.#variant === 'detailed') {
          const phase: string = record.phaseName ? ` (${record.phaseName})` : '';
          this.#writeLine('');
          this.#writeLine(`==[ ${record.projectName}${phase} ]==`);
          this.#writeSpooledOutput(record);
          this.#writeLine(this.#formatStatus(record.projectName, 'aborted'));
        } else {
          this.#deleteSpool(record);
        }
        cycle.operations.delete(operationId);
      }
    }
    this.#watchCycles.clear();
    this.#removeSpoolDirectory();
  }

  /**
   * Emits a compact heartbeat if the heartbeat interval has elapsed since the
   * last output. Returns whether a heartbeat was emitted.
   */
  public emitHeartbeatIfDue(): boolean {
    const cycle: IWatchCycleState = this.#getLatestWatchCycle();
    if (this.#nowMs() - this.#lastOutputMs >= this.#heartbeatIntervalMs) {
      this.#writeLine(
        `... ${this.#commandName ?? 'rush'} still running — ${cycle.completed}/${cycle.total} operations`
      );
      return true;
    }
    return false;
  }

  #stopHeartbeat(): void {
    this.#disposeHeartbeat?.();
    this.#disposeHeartbeat = undefined;
  }

  #onOperationCompleted(event: IReporterEventEnvelope<unknown>): void {
    const payload: { operationId: string; status: string; iterationId?: number } = event.payload as {
      operationId: string;
      status: string;
      iterationId?: number;
    };
    const iterationId: number = getIterationId(payload, this.#legacyIterationId);
    const cycle: IWatchCycleState = this.#getWatchCycle(iterationId);
    const record: IOperationRecord | undefined = cycle.operations.get(payload.operationId);
    const projectName: string = record?.projectName ?? event.scope?.projectName ?? payload.operationId;

    if (!TERMINAL_STATUSES.has(payload.status)) {
      return;
    }
    if (record?.silent) {
      this.#deleteSpool(record);
      cycle.operations.delete(payload.operationId);
      return;
    }

    cycle.completed++;
    if (payload.status === 'failure') {
      cycle.failed++;
    }

    if (this.#logLevel === 'quiet') {
      if (record) {
        this.#deleteSpool(record);
      }
      cycle.operations.delete(payload.operationId);
      return;
    }

    if (this.#variant === 'detailed') {
      const phase: string = record?.phaseName ? ` (${record.phaseName})` : '';
      this.#writeLine('');
      this.#writeLine(`==[ ${projectName}${phase} ]==`);
      if (record) {
        this.#writeSpooledOutput(record);
      }
      this.#writeLine(this.#formatStatus(projectName, payload.status));
    } else {
      this.#writeLine(this.#formatStatus(projectName, payload.status));
    }
    cycle.operations.delete(payload.operationId);
  }

  #onExternalOutput(event: IReporterEventEnvelope<unknown>): void {
    if (this.#variant !== 'detailed') {
      return;
    }
    const operationId: string | undefined = event.scope?.operationId;
    const payload: { text?: string; iterationId?: number; wasRendered?: boolean } = event.payload as {
      text?: string;
      iterationId?: number;
      wasRendered?: boolean;
    };
    if (payload.wasRendered === true) {
      return;
    }
    const text: string = payload.text ?? '';
    const cycle: IWatchCycleState = this.#getWatchCycle(getIterationId(payload, this.#legacyIterationId));
    const record: IOperationRecord | undefined =
      operationId !== undefined ? cycle.operations.get(operationId) : undefined;
    if (record) {
      this.#spoolOutput(record, text);
    } else {
      this.#writeRaw(text);
    }
  }

  #spoolOutput(record: IOperationRecord, text: string): void {
    if (record.spoolFailed) {
      this.#writeRaw(text);
      return;
    }

    try {
      if (!record.spoolPath) {
        const spoolDirectory: string = this.#ensureSpoolDirectory();
        record.spoolPath = path.join(spoolDirectory, `${this.#nextSpoolId++}.operation`);
        record.spoolFileDescriptor = fs.openSync(record.spoolPath, 'wx', OWNER_ONLY_MODE);
      }
      if (record.spoolFileDescriptor === undefined) {
        throw new Error('The grouped plaintext spool descriptor is not available.');
      }
      writeAllSync(record.spoolFileDescriptor, text);
    } catch (error) {
      this.#closeSpool(record, false);
      this.#writeSpooledOutput(
        record,
        Buffer.from(text, 'utf8').subarray(error instanceof WriteAllSyncError ? error.bytesWritten : 0)
      );
      record.spoolFailed = true;
      this.#writeLine(`[reporter] Unable to spool grouped plaintext output: ${(error as Error).message}`);
    }
  }

  #writeSpooledOutput(record: IOperationRecord, remainingOutput?: Uint8Array): void {
    if (!record.spoolPath) {
      if (remainingOutput) {
        this.#writeRaw(Buffer.from(remainingOutput).toString('utf8'));
      }
      return;
    }
    const spoolCloseError: Error | undefined = this.#closeSpool(record, true);
    if (spoolCloseError) {
      this.#writeLine(`[reporter] Unable to close grouped plaintext output: ${spoolCloseError.message}`);
    }
    let fileDescriptor: number | undefined;
    let readError: Error | undefined;
    let readCloseError: Error | undefined;
    const decoder: StringDecoder = new StringDecoder('utf8');
    try {
      fileDescriptor = fs.openSync(record.spoolPath, 'r');
      const buffer: Buffer = Buffer.allocUnsafe(64 * 1024);
      let bytesRead: number;
      while ((bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null)) > 0) {
        this.#writeRaw(decoder.write(buffer.subarray(0, bytesRead)));
      }
    } catch (error) {
      readError = error as Error;
    } finally {
      if (fileDescriptor !== undefined) {
        try {
          fs.closeSync(fileDescriptor);
        } catch (error) {
          readCloseError = error as Error;
        }
      }
      this.#deleteSpool(record);
    }
    if (remainingOutput) {
      this.#writeRaw(decoder.write(remainingOutput));
    }
    this.#writeRaw(decoder.end());
    if (readError) {
      this.#writeLine(
        `[reporter] Unable to read grouped plaintext output; see the full log: ${readError.message}`
      );
    }
    if (readCloseError) {
      this.#writeLine(`[reporter] Unable to close grouped plaintext input: ${readCloseError.message}`);
    }
  }

  #ensureSpoolDirectory(): string {
    if (!this.#spoolDirectory) {
      this.#spoolDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-plaintext-reporter-'));
      fs.chmodSync(this.#spoolDirectory, OWNER_ONLY_DIRECTORY_MODE);
    }
    return this.#spoolDirectory;
  }

  #deleteSpool(record: IOperationRecord): void {
    this.#closeSpool(record, false);
    if (!record.spoolPath) {
      return;
    }
    try {
      fs.rmSync(record.spoolPath, { force: true });
    } catch {
      /* Best-effort cleanup. */
    }
    record.spoolPath = undefined;
  }

  #closeSpool(record: IOperationRecord, flush: boolean): Error | undefined {
    const fileDescriptor: number | undefined = record.spoolFileDescriptor;
    if (fileDescriptor === undefined) {
      return undefined;
    }
    record.spoolFileDescriptor = undefined;
    let closeError: Error | undefined;
    if (flush) {
      try {
        fs.fsyncSync(fileDescriptor);
      } catch (error) {
        closeError = error as Error;
      }
    }
    try {
      fs.closeSync(fileDescriptor);
    } catch (error) {
      closeError ??= error as Error;
    }
    return closeError;
  }

  #removeSpoolDirectory(): void {
    if (!this.#spoolDirectory) {
      return;
    }
    try {
      fs.rmdirSync(this.#spoolDirectory);
    } catch {
      /* Best-effort cleanup. */
    }
    this.#spoolDirectory = undefined;
  }

  #getWatchCycle(iterationId: number): IWatchCycleState {
    let cycle: IWatchCycleState | undefined = this.#watchCycles.get(iterationId);
    if (!cycle) {
      cycle = {
        operations: new Map(),
        total: 0,
        completed: 0,
        failed: 0,
        watchCompleted: false
      };
      this.#watchCycles.set(iterationId, cycle);
    }
    this.#latestIterationId = Math.max(this.#latestIterationId, iterationId);
    this.#pruneCompletedWatchCycles();
    return cycle;
  }

  #getLatestWatchCycle(): IWatchCycleState {
    return this.#getWatchCycle(this.#latestIterationId);
  }

  #pruneCompletedWatchCycles(): void {
    for (const [iterationId, cycle] of this.#watchCycles) {
      if (iterationId < this.#latestIterationId && cycle.watchCompleted) {
        for (const record of cycle.operations.values()) {
          this.#deleteSpool(record);
        }
        this.#watchCycles.delete(iterationId);
      }
    }
  }

  #onResult(payload: { commandName: string; succeeded: boolean; exitCode: number }): void {
    const commandName: string = payload.commandName ?? this.#commandName ?? 'rush';
    const cycle: IWatchCycleState = this.#getLatestWatchCycle();
    if (payload.succeeded) {
      this.#writeLine(
        this.#color.green(
          `rush ${commandName} succeeded (${cycle.completed}/${cycle.total} operations, ${cycle.failed} failed)`
        )
      );
    } else {
      this.#writeLine(this.#color.red(`rush ${commandName} failed (${cycle.failed} failed)`));
    }
    if (this.#logPath) {
      this.#writeLine(`Full log: ${this.#logPath}`);
    }
  }

  #formatStatus(projectName: string, status: string): string {
    const line: string = `${projectName}: ${status}`;
    if (status === 'failure') {
      return this.#color.red(line);
    }
    return line;
  }

  #formatDiagnostic(severity: string, line: string): string {
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
