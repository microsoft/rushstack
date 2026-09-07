// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import { redactReporterEvent } from './ReporterRedaction';

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
   * Whether every event and grouped output chunk has been persisted.
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

  private readonly _commonTempFolder: string | undefined;
  private readonly _osTempFolder: string;
  private readonly _actionName: string;
  private readonly _pid: number;
  private readonly _nowMs: () => number;
  private readonly _retentionDays: number;
  private readonly _maxSessions: number;
  private readonly _emergencyWarn: (message: string) => void;

  private readonly _lines: string[];
  private readonly _operations: Map<string, IFileOperationRecord>;
  private _fileDescriptor: number | undefined;
  private _targetResolved: boolean;
  private _available: boolean;
  private _complete: boolean;
  private _canComplete: boolean;
  private _targetPath: string | undefined;
  private _latestCopyPath: string | undefined;
  private readonly _fileName: string;
  private _nextSpoolId: number;

  public constructor(options: IFileReporterOptions = {}) {
    this._commonTempFolder = options.commonTempFolder;
    this._osTempFolder = options.osTempFolder ?? os.tmpdir();
    this._actionName = sanitizeActionName(options.actionName ?? 'rush');
    this._pid = options.pid ?? process.pid;
    this._nowMs = options.nowMs ?? (() => Date.now());
    this._retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this._maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this._emergencyWarn =
      options.emergencyWarn ??
      ((message: string) => {
        process.stderr.write(`${message}\n`);
      });

    this._lines = [];
    this._operations = new Map();
    this._fileDescriptor = undefined;
    this._targetResolved = false;
    this._available = false;
    this._complete = false;
    this._canComplete = true;
    this._targetPath = undefined;
    this._latestCopyPath = undefined;
    this._nextSpoolId = 1;

    const timestamp: string = new Date(this._nowMs()).toISOString().replace(/[:.]/g, '-');
    this._fileName = `${timestamp}-${this._pid}-${this._actionName}.log`;
  }

  public async initializeAsync(): Promise<void> {
    await this._ensureTargetAsync();
    this._writeBufferedLines();
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    const lines: readonly string[] = this._formatEvent(event);
    for (const line of lines) {
      if (this._fileDescriptor === undefined) {
        if (!this._targetResolved) {
          this._lines.push(line);
        }
      } else {
        this._writeLine(line);
      }
    }
  }

  public async flushAsync(): Promise<void> {
    await this._ensureTargetAsync();
    this._writeBufferedLines();
    if (this._fileDescriptor !== undefined) {
      try {
        fs.fsyncSync(this._fileDescriptor);
      } catch (error) {
        this._markUnavailable(error as Error);
      }
    }
    await this._refreshLatestCopyAsync();
  }

  public async closeAsync(): Promise<void> {
    for (const record of this._operations.values()) {
      this._writeGroupedOperation(record.operationId, record, 'aborted');
    }
    this._operations.clear();
    await this.flushAsync();
    if (this._fileDescriptor !== undefined) {
      try {
        fs.closeSync(this._fileDescriptor);
      } catch (error) {
        this._available = false;
        this._complete = false;
        this._canComplete = false;
        this._emergencyWarn(
          `[reporter] Unable to close the full-detail log; the artifact is unavailable: ${(error as Error).message}`
        );
      } finally {
        this._fileDescriptor = undefined;
      }
    }
    await this._refreshLatestCopyAsync();
    this._complete = this._available && this._canComplete;
  }

  /**
   * Returns the resolved log artifact.
   */
  public getArtifact(): IFileReporterArtifact {
    return this._targetPath !== undefined
      ? { available: this._available, path: this._targetPath, complete: this._available && this._complete }
      : { available: this._available, complete: false };
  }

  private _formatEvent(event: IReporterEventEnvelope<unknown>): readonly string[] {
    if (event.privacy === 'secret') {
      return [this._formatMetadata(event)];
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
      const previousOperation: IFileOperationRecord | undefined = this._operations.get(operationKey);
      if (previousOperation) {
        return [this._formatMetadata(event)];
      }
      this._operations.set(
        operationKey,
        this._createOperationRecord(
          payload.operationId,
          payload.phaseName ? `${projectName} (${payload.phaseName})` : projectName
        )
      );
      return [this._formatMetadata(event)];
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
        operationKey === undefined ? undefined : this._operations.get(operationKey);
      if (operationId !== undefined && operation) {
        return this._spoolOperationOutput(operationId, operation, payload.stream ?? 'stdout', text);
      }
      return operationId ? [`# [${operationId}]\n`, text] : [text];
    }

    if (event.type === 'operationStatusChanged') {
      return [this._formatMetadata(event)];
    }

    if (event.type === 'operationCompleted') {
      const payload: { operationId: string; status: string; iterationId?: number } = event.payload as {
        operationId: string;
        status: string;
        iterationId?: number;
      };
      const operationKey: string = getOperationKey(payload.operationId, payload.iterationId);
      const operation: IFileOperationRecord | undefined = this._operations.get(operationKey);
      if (operation && TERMINAL_STATUSES.has(payload.status)) {
        this._operations.delete(operationKey);
        this._writeGroupedOperation(payload.operationId, operation, payload.status);
        return [];
      }
    }

    return [this._formatMetadata(event)];
  }

  private _formatMetadata(event: IReporterEventEnvelope<unknown>): string {
    return `# ${JSON.stringify(redactReporterEvent(event))}\n`;
  }

  private _createOperationRecord(operationId: string, title: string): IFileOperationRecord {
    return { operationId, title };
  }

  private _spoolOperationOutput(
    operationId: string,
    operation: IFileOperationRecord,
    stream: string,
    text: string
  ): readonly string[] {
    if (operation.spoolFailed || !this._targetPath) {
      return [`# [${operationId} ${stream}]\n`, text];
    }

    if (!operation.spoolPath) {
      operation.spoolPath = `${this._targetPath}.${this._nextSpoolId++}.operation`;
      try {
        operation.spoolFileDescriptor = fs.openSync(operation.spoolPath, 'wx', OWNER_ONLY_MODE);
      } catch (error) {
        operation.spoolFailed = true;
        operation.spoolPath = undefined;
        operation.spoolFileDescriptor = undefined;
        this._emergencyWarn(
          `[reporter] Unable to create grouped-output spool file; output will remain ungrouped: ${(error as Error).message}`
        );
        return [`# [${operationId} ${stream}]\n`, text];
      }
    }

    try {
      if (operation.spoolFileDescriptor === undefined) {
        throw new Error('The grouped-output spool descriptor is not available.');
      }
      fs.writeSync(operation.spoolFileDescriptor, text, null, 'utf8');
      return [];
    } catch (error) {
      const closeError: Error | undefined = this._closeOperationSpool(operation, false);
      if (closeError) {
        this._complete = false;
        this._canComplete = false;
      }
      if (operation.spoolPath) {
        this._writeOrBuffer(`# [${operationId} ${stream}]\n`);
        if (!this._appendSpoolFile(operation.spoolPath)) {
          this._complete = false;
          this._canComplete = false;
        }
      }
      try {
        fs.rmSync(operation.spoolPath, { force: true });
      } catch {
        /* Best-effort cleanup. */
      }
      operation.spoolPath = undefined;
      operation.spoolFailed = true;
      this._emergencyWarn(
        `[reporter] Unable to spool grouped output for ${JSON.stringify(operationId)}; output will remain ungrouped: ${(error as Error).message}`
      );
      return [text];
    }
  }

  private _writeGroupedOperation(operationId: string, operation: IFileOperationRecord, status: string): void {
    if (operation.spoolFailed) {
      this._writeOrBuffer(`==[ ${operationId}: ${status} ]==\n`);
      return;
    }
    this._writeOrBuffer(`\n==[ ${operation.title} ]==\n`);
    if (operation.spoolPath !== undefined) {
      const closeError: Error | undefined = this._closeOperationSpool(operation, true);
      if (closeError) {
        this._complete = false;
        this._canComplete = false;
        this._emergencyWarn(
          `[reporter] Unable to close grouped output for ${JSON.stringify(operationId)}: ${closeError.message}`
        );
      }
      try {
        if (!this._appendSpoolFile(operation.spoolPath)) {
          throw new Error('The grouped output could not be appended to the full-detail log.');
        }
      } catch (error) {
        this._complete = false;
        this._canComplete = false;
        this._emergencyWarn(
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
    this._writeOrBuffer(`==[ ${operationId}: ${status} ]==\n`);
  }

  private _appendSpoolFile(spoolPath: string): boolean {
    if (this._fileDescriptor === undefined) {
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
        fs.writeSync(this._fileDescriptor, buffer, 0, bytesRead);
        lastByte = buffer[bytesRead - 1];
      }
      if (lastByte !== undefined && lastByte !== 0x0a) {
        this._writeLine('\n');
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

  private _writeOrBuffer(line: string): void {
    if (this._fileDescriptor === undefined) {
      if (!this._targetResolved) {
        this._lines.push(line);
      }
    } else {
      this._writeLine(line);
    }
  }

  private async _ensureTargetAsync(): Promise<void> {
    if (!this._targetResolved) {
      this._targetResolved = true;
      await this._resolveTargetAsync();
    }
  }

  private _writeBufferedLines(): void {
    if (this._fileDescriptor === undefined) {
      this._lines.length = 0;
      return;
    }
    const newLines: string[] = this._lines.splice(0);
    for (const line of newLines) {
      if (!this._writeLine(line)) {
        break;
      }
    }
  }

  private _writeLine(line: string): boolean {
    if (this._fileDescriptor === undefined) {
      return false;
    }
    try {
      fs.writeSync(this._fileDescriptor, line, null, 'utf8');
      return true;
    } catch (error) {
      this._markUnavailable(error as Error);
      return false;
    }
  }

  private async _refreshLatestCopyAsync(): Promise<void> {
    if (this._latestCopyPath === undefined || this._targetPath === undefined || !this._available) {
      return;
    }
    try {
      await fs.promises.copyFile(this._targetPath, this._latestCopyPath);
    } catch {
      /* latest.log is best-effort. */
    }
  }

  private _markUnavailable(error: Error): void {
    if (!this._available) {
      return;
    }
    this._available = false;
    this._complete = false;
    this._canComplete = false;
    this._lines.length = 0;
    for (const operation of this._operations.values()) {
      this._discardOperationSpool(operation);
      operation.spoolFailed = true;
    }
    if (this._fileDescriptor !== undefined) {
      try {
        fs.closeSync(this._fileDescriptor);
      } catch {
        /* The original write failure is more useful. */
      }
      this._fileDescriptor = undefined;
    }
    this._emergencyWarn(
      `[reporter] Unable to write the full-detail log; the artifact is unavailable: ${error.message}`
    );
  }

  private _closeOperationSpool(operation: IFileOperationRecord, flush: boolean): Error | undefined {
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

  private _discardOperationSpool(operation: IFileOperationRecord): void {
    const closeError: Error | undefined = this._closeOperationSpool(operation, false);
    if (closeError) {
      this._complete = false;
      this._canComplete = false;
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

  private async _resolveTargetAsync(): Promise<void> {
    const candidateDirs: Array<{ path: string; ownerOnly: boolean }> = [];
    if (this._commonTempFolder !== undefined) {
      candidateDirs.push({ path: path.join(this._commonTempFolder, RUSH_LOGS_DIR_NAME), ownerOnly: false });
    }
    candidateDirs.push({
      path: path.join(this._osTempFolder, getUserTempDirectoryName()),
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
        const filePath: string = path.join(dir, this._fileName);
        await fs.promises.writeFile(filePath, '', { mode: OWNER_ONLY_MODE });
        await fs.promises.chmod(filePath, OWNER_ONLY_MODE);
        const fileDescriptor: number = fs.openSync(filePath, 'a');
        this._fileDescriptor = fileDescriptor;
        this._targetPath = filePath;
        this._available = true;
        await this._updateLatestAsync(dir, filePath);
        await this._applyRetentionAsync(dir);
        return;
      } catch (error) {
        lastError = error as Error;
      }
    }

    this._available = false;
    this._complete = false;
    this._canComplete = false;
    this._lines.length = 0;
    this._emergencyWarn(
      `[reporter] Unable to write the full-detail log; the artifact is unavailable: ${lastError?.message ?? 'unknown error'}`
    );
  }

  private async _updateLatestAsync(dir: string, filePath: string): Promise<void> {
    const latestPath: string = path.join(dir, LATEST_LOG_NAME);
    try {
      await fs.promises.rm(latestPath, { force: true });
      await fs.promises.symlink(path.basename(filePath), latestPath);
      this._latestCopyPath = undefined;
    } catch {
      this._latestCopyPath = latestPath;
    }
  }

  private async _applyRetentionAsync(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      return;
    }

    const cutoff: number = this._nowMs() - this._retentionDays * MS_PER_DAY;
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

    if (logs.length > this._maxSessions) {
      logs.sort((a, b) => a.mtimeMs - b.mtimeMs);
      const excess: number = logs.length - this._maxSessions;
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
