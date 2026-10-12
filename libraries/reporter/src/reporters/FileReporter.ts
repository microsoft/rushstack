// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import { redactReporterEvent } from './ReporterRedaction';
import { writeAllSync, WriteAllSyncError } from '../utilities/writeAllSync';

/**
 * The subdirectory that holds full-detail invocation logs. `rush purge` removes it.
 *
 * @beta
 */
export const RUSH_LOGS_DIR_NAME: 'rush-logs' = 'rush-logs';

/**
 * The name of the pointer to the latest invocation log.
 *
 * @beta
 */
export const LATEST_LOG_NAME: 'latest.log' = 'latest.log';

const DEFAULT_RETENTION_DAYS: number = 14;
const DEFAULT_MAX_SESSIONS: number = 20;
const OWNER_ONLY_MODE: number = 0o600;
const OWNER_ONLY_DIRECTORY_MODE: number = 0o700;
const MS_PER_DAY: number = 24 * 60 * 60 * 1000;
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

interface IFileOperationRecord {
  readonly operationId: string;
  readonly title: string;
  spoolPath?: string;
  spoolFileDescriptor?: number;
  spoolFailed?: boolean;
}

function getUserTempDirectoryName(): string {
  const identity: string =
    typeof process.getuid === 'function' ? String(process.getuid()) : os.userInfo().username;
  return `${RUSH_LOGS_DIR_NAME}-${identity.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
}

function sanitizeActionName(actionName: string): string {
  const sanitized: string = actionName.replace(/[^a-zA-Z0-9_.-]+/g, '_');
  return sanitized === '.' || sanitized === '..' || sanitized.length === 0 ? 'rush' : sanitized;
}

function getOperationKey(operationId: string, iterationId: number | undefined): string {
  return iterationId === undefined ? operationId : `${iterationId}\u0000${operationId}`;
}

/**
 * The resolved full-detail log artifact.
 *
 * @beta
 */
export interface IFileReporterArtifact {
  /**
   * Whether the log was successfully written.
   */
  readonly available: boolean;

  /**
   * The absolute path to the log, when available.
   */
  readonly path?: string;

  /**
   * Whether all events and grouped output chunks accepted before closing were persisted
   * and the log closed successfully. The frontend publishes the final completeness
   * notification after closure; that notification is not appended to this log.
   */
  readonly complete: boolean;
}

/**
 * Options for {@link FileReporter}.
 *
 * @beta
 */
export interface IFileReporterOptions {
  /**
   * The repository common temp folder. The log is written under its `rush-logs`
   * subdirectory when available.
   */
  readonly commonTempFolder?: string;

  /**
   * The OS temp folder used as a fallback. Defaults to the OS temp directory.
   */
  readonly osTempFolder?: string;

  /**
   * The action name embedded in the log file name.
   */
  readonly actionName?: string;

  /**
   * The process id embedded in the log file name. Defaults to `process.pid`.
   */
  readonly pid?: number;

  /**
   * Returns the current time in milliseconds. Injectable for testing.
   */
  readonly nowMs?: () => number;

  /**
   * The retention window in days. Defaults to 14.
   */
  readonly retentionDays?: number;

  /**
   * The maximum number of retained sessions. Defaults to 20.
   */
  readonly maxSessions?: number;

  /**
   * Writes a one-line emergency warning when the log cannot be written.
   */
  readonly emergencyWarn?: (message: string) => void;
}

/**
 * Writes a full-detail, debug-level invocation log with retention and an OS-temp fallback.
 *
 * @remarks
 * The reporter streams events as NDJSON to
 * `<commonTempFolder>/rush-logs/<UTC timestamp>-<pid>-<action>.log` with
 * owner-only permissions, redacting fields classified as secret. It maintains a
 * `latest.log` pointer for both successful and failed commands, deletes logs
 * older than 14 days, caps retention at 20 sessions, and falls back to the OS
 * temp folder. Failure at both paths is nonfatal: it emits an emergency warning
 * and marks the artifact unavailable.
 *
 * @beta
 */
export class FileReporter implements IReporter {
  public readonly name: string = 'file';

  readonly #commonTempFolder: string | undefined;
  readonly #osTempFolder: string;
  readonly #actionName: string;
  readonly #pid: number;
  readonly #nowMs: () => number;
  readonly #retentionDays: number;
  readonly #maxSessions: number;
  readonly #emergencyWarn: (message: string) => void;

  readonly #lines: string[];
  readonly #operations: Map<string, IFileOperationRecord>;
  #fileDescriptor: number | undefined;
  #targetResolved: boolean;
  #available: boolean;
  #complete: boolean;
  #canComplete: boolean;
  #targetPath: string | undefined;
  #latestCopyPath: string | undefined;
  readonly #fileName: string;
  #nextSpoolId: number;

  public constructor(options: IFileReporterOptions = {}) {
    this.#commonTempFolder = options.commonTempFolder;
    this.#osTempFolder = options.osTempFolder ?? os.tmpdir();
    this.#actionName = sanitizeActionName(options.actionName ?? 'rush');
    this.#pid = options.pid ?? process.pid;
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.#maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.#emergencyWarn =
      options.emergencyWarn ??
      ((message: string) => {
        process.stderr.write(`${message}\n`);
      });

    this.#lines = [];
    this.#operations = new Map();
    this.#fileDescriptor = undefined;
    this.#targetResolved = false;
    this.#available = false;
    this.#complete = false;
    this.#canComplete = true;
    this.#targetPath = undefined;
    this.#latestCopyPath = undefined;
    this.#nextSpoolId = 1;

    const timestamp: string = new Date(this.#nowMs()).toISOString().replace(/[:.]/g, '-');
    this.#fileName = `${timestamp}-${this.#pid}-${this.#actionName}.log`;
  }

  public async initializeAsync(): Promise<void> {
    await this.#ensureTargetAsync();
    this.#writeBufferedLines();
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    const lines: readonly string[] = this.#formatEvent(event);
    for (const line of lines) {
      if (this.#fileDescriptor === undefined) {
        if (!this.#targetResolved) {
          this.#lines.push(line);
        }
      } else {
        this.#writeLine(line);
      }
    }
  }

  public async flushAsync(): Promise<void> {
    await this.#ensureTargetAsync();
    this.#writeBufferedLines();
    if (this.#fileDescriptor !== undefined) {
      try {
        fs.fsyncSync(this.#fileDescriptor);
      } catch (error) {
        this.#markUnavailable(error as Error);
      }
    }
    await this.#refreshLatestCopyAsync();
  }

  public async closeAsync(): Promise<void> {
    for (const record of this.#operations.values()) {
      this.#writeGroupedOperation(record.operationId, record, 'aborted');
    }
    this.#operations.clear();
    await this.flushAsync();
    if (this.#fileDescriptor !== undefined) {
      try {
        fs.closeSync(this.#fileDescriptor);
      } catch (error) {
        this.#available = false;
        this.#complete = false;
        this.#canComplete = false;
        this.#emergencyWarn(
          `[reporter] Unable to close the full-detail log; the artifact is unavailable: ${(error as Error).message}`
        );
      } finally {
        this.#fileDescriptor = undefined;
      }
    }
    await this.#refreshLatestCopyAsync();
    this.#complete = this.#available && this.#canComplete;
  }

  /**
   * Returns the resolved log artifact.
   */
  public getArtifact(): IFileReporterArtifact {
    return this.#targetPath !== undefined
      ? { available: this.#available, path: this.#targetPath, complete: this.#available && this.#complete }
      : { available: this.#available, complete: false };
  }

  #formatEvent(event: IReporterEventEnvelope<unknown>): readonly string[] {
    if (event.privacy === 'secret') {
      return [this.#formatMetadata(event)];
    }

    if (event.type === 'operationRegistered') {
      const payload: {
        operationId: string;
        projectName?: string;
        phaseName?: string;
        iterationId?: number;
      } = event.payload as {
        operationId: string;
        projectName?: string;
        phaseName?: string;
        iterationId?: number;
      };
      const projectName: string = payload.projectName ?? payload.operationId;
      const operationKey: string = getOperationKey(payload.operationId, payload.iterationId);
      const previousOperation: IFileOperationRecord | undefined = this.#operations.get(operationKey);
      if (previousOperation) {
        return [this.#formatMetadata(event)];
      }
      this.#operations.set(
        operationKey,
        this.#createOperationRecord(
          payload.operationId,
          payload.phaseName ? `${projectName} (${payload.phaseName})` : projectName
        )
      );
      return [this.#formatMetadata(event)];
    }

    if (event.type === 'externalOutput') {
      const operationId: string | undefined = event.scope?.operationId;
      const payload: { text?: string; iterationId?: number; stream?: string } = event.payload as {
        text?: string;
        iterationId?: number;
        stream?: string;
      };
      const text: string = payload.text ?? '';
      const operationKey: string | undefined =
        operationId === undefined ? undefined : getOperationKey(operationId, payload.iterationId);
      const operation: IFileOperationRecord | undefined =
        operationKey === undefined ? undefined : this.#operations.get(operationKey);
      if (operationId !== undefined && operation) {
        return this.#spoolOperationOutput(operationId, operation, payload.stream ?? 'stdout', text);
      }
      return operationId ? [`# [${operationId}]\n`, text] : [text];
    }

    if (event.type === 'operationStatusChanged') {
      return [this.#formatMetadata(event)];
    }

    if (event.type === 'operationCompleted') {
      const payload: { operationId: string; status: string; iterationId?: number } = event.payload as {
        operationId: string;
        status: string;
        iterationId?: number;
      };
      const operationKey: string = getOperationKey(payload.operationId, payload.iterationId);
      const operation: IFileOperationRecord | undefined = this.#operations.get(operationKey);
      if (operation && TERMINAL_STATUSES.has(payload.status)) {
        this.#operations.delete(operationKey);
        this.#writeGroupedOperation(payload.operationId, operation, payload.status);
        return [];
      }
    }

    return [this.#formatMetadata(event)];
  }

  #formatMetadata(event: IReporterEventEnvelope<unknown>): string {
    return `# ${JSON.stringify(redactReporterEvent(event))}\n`;
  }

  #createOperationRecord(operationId: string, title: string): IFileOperationRecord {
    return { operationId, title };
  }

  #spoolOperationOutput(
    operationId: string,
    operation: IFileOperationRecord,
    stream: string,
    text: string
  ): readonly string[] {
    if (operation.spoolFailed || !this.#targetPath) {
      return [`# [${operationId} ${stream}]\n`, text];
    }

    if (!operation.spoolPath) {
      operation.spoolPath = `${this.#targetPath}.${this.#nextSpoolId++}.operation`;
      try {
        operation.spoolFileDescriptor = fs.openSync(operation.spoolPath, 'wx', OWNER_ONLY_MODE);
      } catch (error) {
        operation.spoolFailed = true;
        operation.spoolPath = undefined;
        operation.spoolFileDescriptor = undefined;
        this.#emergencyWarn(
          `[reporter] Unable to create grouped-output spool file; output will remain ungrouped: ${(error as Error).message}`
        );
        return [`# [${operationId} ${stream}]\n`, text];
      }
    }

    try {
      if (operation.spoolFileDescriptor === undefined) {
        throw new Error('The grouped-output spool descriptor is not available.');
      }
      writeAllSync(operation.spoolFileDescriptor, text);
      return [];
    } catch (error) {
      this.#complete = false;
      this.#canComplete = false;
      const remainingOutput: Buffer = Buffer.from(text, 'utf8').subarray(
        error instanceof WriteAllSyncError ? error.bytesWritten : 0
      );
      const closeError: Error | undefined = this.#closeOperationSpool(operation, false);
      if (closeError) {
        this.#complete = false;
        this.#canComplete = false;
      }
      if (operation.spoolPath) {
        this.#writeOrBuffer(`# [${operationId} ${stream}]\n`);
        if (!this.#appendSpoolFile(operation.spoolPath, false)) {
          this.#complete = false;
          this.#canComplete = false;
        }
      }
      try {
        fs.rmSync(operation.spoolPath, { force: true });
      } catch {
        /* Best-effort cleanup. */
      }
      operation.spoolPath = undefined;
      operation.spoolFailed = true;
      this.#emergencyWarn(
        `[reporter] Unable to spool grouped output for ${JSON.stringify(operationId)}; output will remain ungrouped: ${(error as Error).message}`
      );
      this.#writeLine(remainingOutput);
      return [];
    }
  }

  #writeGroupedOperation(operationId: string, operation: IFileOperationRecord, status: string): void {
    if (operation.spoolFailed) {
      this.#writeOrBuffer(`==[ ${operationId}: ${status} ]==\n`);
      return;
    }
    this.#writeOrBuffer(`\n==[ ${operation.title} ]==\n`);
    if (operation.spoolPath !== undefined) {
      const closeError: Error | undefined = this.#closeOperationSpool(operation, true);
      if (closeError) {
        this.#complete = false;
        this.#canComplete = false;
        this.#emergencyWarn(
          `[reporter] Unable to close grouped output for ${JSON.stringify(operationId)}: ${closeError.message}`
        );
      }
      try {
        if (!this.#appendSpoolFile(operation.spoolPath)) {
          throw new Error('The grouped output could not be appended to the full-detail log.');
        }
      } catch (error) {
        this.#complete = false;
        this.#canComplete = false;
        this.#emergencyWarn(
          `[reporter] Unable to append grouped output for ${JSON.stringify(operationId)}: ${(error as Error).message}`
        );
      } finally {
        try {
          fs.rmSync(operation.spoolPath, { force: true });
        } catch {
          /* Best-effort cleanup. */
        }
      }
    }
    this.#writeOrBuffer(`==[ ${operationId}: ${status} ]==\n`);
  }

  #appendSpoolFile(spoolPath: string, ensureNewlineAtEnd: boolean = true): boolean {
    if (this.#fileDescriptor === undefined) {
      return false;
    }
    let source: number | undefined;
    let appended: boolean = false;
    let closed: boolean = true;
    try {
      source = fs.openSync(spoolPath, 'r');
      const buffer: Buffer = Buffer.allocUnsafe(64 * 1024);
      let bytesRead: number;
      let lastByte: number | undefined;
      while ((bytesRead = fs.readSync(source, buffer, 0, buffer.length, null)) > 0) {
        writeAllSync(this.#fileDescriptor, buffer.subarray(0, bytesRead));
        lastByte = buffer[bytesRead - 1];
      }
      if (ensureNewlineAtEnd && lastByte !== undefined && lastByte !== 0x0a) {
        this.#writeLine('\n');
      }
      appended = true;
    } catch {
      appended = false;
    } finally {
      if (source !== undefined) {
        try {
          fs.closeSync(source);
        } catch {
          closed = false;
        }
      }
    }
    return appended && closed;
  }

  #writeOrBuffer(line: string): void {
    if (this.#fileDescriptor === undefined) {
      if (!this.#targetResolved) {
        this.#lines.push(line);
      }
    } else {
      this.#writeLine(line);
    }
  }

  async #ensureTargetAsync(): Promise<void> {
    if (!this.#targetResolved) {
      this.#targetResolved = true;
      await this.#resolveTargetAsync();
    }
  }

  #writeBufferedLines(): void {
    if (this.#fileDescriptor === undefined) {
      this.#lines.length = 0;
      return;
    }
    const newLines: string[] = this.#lines.splice(0);
    for (const line of newLines) {
      if (!this.#writeLine(line)) {
        break;
      }
    }
  }

  #writeLine(line: string | Uint8Array): boolean {
    if (this.#fileDescriptor === undefined) {
      return false;
    }
    try {
      writeAllSync(this.#fileDescriptor, line);
      return true;
    } catch (error) {
      this.#markUnavailable(error as Error);
      return false;
    }
  }

  async #refreshLatestCopyAsync(): Promise<void> {
    if (this.#latestCopyPath === undefined || this.#targetPath === undefined || !this.#available) {
      return;
    }
    try {
      await fs.promises.copyFile(this.#targetPath, this.#latestCopyPath);
    } catch {
      /* latest.log is best-effort. */
    }
  }

  #markUnavailable(error: Error): void {
    if (!this.#available) {
      return;
    }
    this.#available = false;
    this.#complete = false;
    this.#canComplete = false;
    this.#lines.length = 0;
    for (const operation of this.#operations.values()) {
      this.#discardOperationSpool(operation);
      operation.spoolFailed = true;
    }
    if (this.#fileDescriptor !== undefined) {
      try {
        fs.closeSync(this.#fileDescriptor);
      } catch {
        /* The original write failure is more useful. */
      }
      this.#fileDescriptor = undefined;
    }
    this.#emergencyWarn(
      `[reporter] Unable to write the full-detail log; the artifact is unavailable: ${error.message}`
    );
  }

  #closeOperationSpool(operation: IFileOperationRecord, flush: boolean): Error | undefined {
    const fileDescriptor: number | undefined = operation.spoolFileDescriptor;
    if (fileDescriptor === undefined) {
      return undefined;
    }
    operation.spoolFileDescriptor = undefined;

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

  #discardOperationSpool(operation: IFileOperationRecord): void {
    const closeError: Error | undefined = this.#closeOperationSpool(operation, false);
    if (closeError) {
      this.#complete = false;
      this.#canComplete = false;
    }
    if (operation.spoolPath) {
      try {
        fs.rmSync(operation.spoolPath, { force: true });
      } catch {
        /* Best-effort cleanup. */
      }
      operation.spoolPath = undefined;
    }
  }

  async #resolveTargetAsync(): Promise<void> {
    const candidateDirs: Array<{ path: string; ownerOnly: boolean }> = [];
    if (this.#commonTempFolder !== undefined) {
      candidateDirs.push({ path: path.join(this.#commonTempFolder, RUSH_LOGS_DIR_NAME), ownerOnly: false });
    }
    candidateDirs.push({
      path: path.join(this.#osTempFolder, getUserTempDirectoryName()),
      ownerOnly: true
    });

    let lastError: Error | undefined;
    for (const candidate of candidateDirs) {
      const dir: string = candidate.path;
      try {
        await fs.promises.mkdir(dir, {
          recursive: true,
          mode: candidate.ownerOnly ? OWNER_ONLY_DIRECTORY_MODE : undefined
        });
        if (candidate.ownerOnly) {
          await fs.promises.chmod(dir, OWNER_ONLY_DIRECTORY_MODE);
        }
        const filePath: string = path.join(dir, this.#fileName);
        await fs.promises.writeFile(filePath, '', { mode: OWNER_ONLY_MODE });
        await fs.promises.chmod(filePath, OWNER_ONLY_MODE);
        const fileDescriptor: number = fs.openSync(filePath, 'a');
        this.#fileDescriptor = fileDescriptor;
        this.#targetPath = filePath;
        this.#available = true;
        await this.#updateLatestAsync(dir, filePath);
        await this.#applyRetentionAsync(dir);
        return;
      } catch (error) {
        lastError = error as Error;
      }
    }

    this.#available = false;
    this.#complete = false;
    this.#canComplete = false;
    this.#lines.length = 0;
    this.#emergencyWarn(
      `[reporter] Unable to write the full-detail log; the artifact is unavailable: ${lastError?.message ?? 'unknown error'}`
    );
  }

  async #updateLatestAsync(dir: string, filePath: string): Promise<void> {
    const latestPath: string = path.join(dir, LATEST_LOG_NAME);
    try {
      await fs.promises.rm(latestPath, { force: true });
      await fs.promises.symlink(path.basename(filePath), latestPath);
      this.#latestCopyPath = undefined;
    } catch {
      this.#latestCopyPath = latestPath;
    }
  }

  async #applyRetentionAsync(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      return;
    }

    const cutoff: number = this.#nowMs() - this.#retentionDays * MS_PER_DAY;
    const logs: { path: string; mtimeMs: number }[] = [];
    for (const entry of entries) {
      if (entry === LATEST_LOG_NAME) {
        continue;
      }
      const entryPath: string = path.join(dir, entry);
      try {
        const stats: fs.Stats = await fs.promises.stat(entryPath);
        if (entry.endsWith('.operation')) {
          if (stats.mtimeMs < cutoff) {
            await fs.promises.rm(entryPath, { force: true });
          }
          continue;
        }
        if (!entry.endsWith('.log')) {
          continue;
        }
        if (stats.mtimeMs < cutoff) {
          await fs.promises.rm(entryPath, { force: true });
        } else {
          logs.push({ path: entryPath, mtimeMs: stats.mtimeMs });
        }
      } catch {
        /* Ignore files that vanish. */
      }
    }

    if (logs.length > this.#maxSessions) {
      logs.sort((a, b) => a.mtimeMs - b.mtimeMs);
      const excess: number = logs.length - this.#maxSessions;
      for (let index: number = 0; index < excess; index++) {
        try {
          await fs.promises.rm(logs[index].path, { force: true });
        } catch {
          /* Ignore. */
        }
      }
    }
  }
}
