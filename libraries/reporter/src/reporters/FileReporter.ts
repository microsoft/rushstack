// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';

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
const MS_PER_DAY: number = 24 * 60 * 60 * 1000;

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
 * The reporter buffers events and, on flush, writes them as NDJSON to
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
  private _writtenCount: number;
  private _targetResolved: boolean;
  private _available: boolean;
  private _targetPath: string | undefined;
  private readonly _fileName: string;

  public constructor(options: IFileReporterOptions = {}) {
    this._commonTempFolder = options.commonTempFolder;
    this._osTempFolder = options.osTempFolder ?? os.tmpdir();
    this._actionName = options.actionName ?? 'rush';
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
    this._writtenCount = 0;
    this._targetResolved = false;
    this._available = false;
    this._targetPath = undefined;

    const timestamp: string = new Date(this._nowMs()).toISOString().replace(/[:.]/g, '-');
    this._fileName = `${timestamp}-${this._pid}-${this._actionName}.log`;
  }

  public async initializeAsync(): Promise<void> {
    /* Events are buffered until the first flush. */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this._lines.push(this._formatLine(event));
  }

  public async flushAsync(): Promise<void> {
    await this._writeAsync();
  }

  public async closeAsync(): Promise<void> {
    await this._writeAsync();
  }

  /**
   * Returns the resolved log artifact.
   */
  public getArtifact(): IFileReporterArtifact {
    return this._targetPath !== undefined
      ? { available: this._available, path: this._targetPath }
      : { available: this._available };
  }

  private _formatLine(event: IReporterEventEnvelope<unknown>): string {
    let payload: unknown = event.payload;
    if (event.privacy === 'secret') {
      payload = '[secret]';
    } else if (event.type === 'diagnosticEmitted') {
      payload = this._redactDiagnostic(event.payload);
    }
    return `${JSON.stringify({ ...event, payload })}\n`;
  }

  private _redactDiagnostic(payload: unknown): unknown {
    const diagnostic: { parameters?: { [name: string]: { value: unknown; privacy: string } } } = payload as {
      parameters?: { [name: string]: { value: unknown; privacy: string } };
    };
    if (!diagnostic.parameters) {
      return payload;
    }
    const parameters: { [name: string]: { value: unknown; privacy: string } } = {};
    for (const [name, classified] of Object.entries(diagnostic.parameters)) {
      parameters[name] =
        classified.privacy === 'secret' ? { value: '[secret]', privacy: 'secret' } : classified;
    }
    return { ...diagnostic, parameters };
  }

  private async _writeAsync(): Promise<void> {
    if (!this._targetResolved) {
      this._targetResolved = true;
      await this._resolveTargetAsync();
    }
    if (!this._available || this._targetPath === undefined) {
      return;
    }
    const newLines: string[] = this._lines.slice(this._writtenCount);
    if (newLines.length > 0) {
      await fs.promises.appendFile(this._targetPath, newLines.join(''), { encoding: 'utf8' });
      this._writtenCount = this._lines.length;
    }
  }

  private async _resolveTargetAsync(): Promise<void> {
    const candidateDirs: string[] = [];
    if (this._commonTempFolder !== undefined) {
      candidateDirs.push(path.join(this._commonTempFolder, RUSH_LOGS_DIR_NAME));
    }
    candidateDirs.push(path.join(this._osTempFolder, RUSH_LOGS_DIR_NAME));

    let lastError: Error | undefined;
    for (const dir of candidateDirs) {
      try {
        await fs.promises.mkdir(dir, { recursive: true });
        const filePath: string = path.join(dir, this._fileName);
        await fs.promises.writeFile(filePath, '', { mode: OWNER_ONLY_MODE });
        await fs.promises.chmod(filePath, OWNER_ONLY_MODE);
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
    this._emergencyWarn(
      `[reporter] Unable to write the full-detail log; the artifact is unavailable: ${lastError?.message ?? 'unknown error'}`
    );
  }

  private async _updateLatestAsync(dir: string, filePath: string): Promise<void> {
    const latestPath: string = path.join(dir, LATEST_LOG_NAME);
    try {
      await fs.promises.rm(latestPath, { force: true });
      await fs.promises.symlink(path.basename(filePath), latestPath);
    } catch {
      try {
        await fs.promises.copyFile(filePath, latestPath);
      } catch {
        /* latest.log is best-effort. */
      }
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
      if (entry === LATEST_LOG_NAME || !entry.endsWith('.log')) {
        continue;
      }
      const entryPath: string = path.join(dir, entry);
      try {
        const stats: fs.Stats = await fs.promises.stat(entryPath);
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
