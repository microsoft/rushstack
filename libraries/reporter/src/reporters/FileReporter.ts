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

function getUserTempDirectoryName(): string {
  const identity: string =
    typeof process.getuid === 'function' ? String(process.getuid()) : os.userInfo().username;
  return `${RUSH_LOGS_DIR_NAME}-${identity.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
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
  #fileDescriptor: number | undefined;
  #targetResolved: boolean;
  #available: boolean;
  #targetPath: string | undefined;
  #latestCopyPath: string | undefined;
  readonly #fileName: string;

  public constructor(options: IFileReporterOptions = {}) {
    this.#commonTempFolder = options.commonTempFolder;
    this.#osTempFolder = options.osTempFolder ?? os.tmpdir();
    this.#actionName = options.actionName ?? 'rush';
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
    this.#fileDescriptor = undefined;
    this.#targetResolved = false;
    this.#available = false;
    this.#targetPath = undefined;
    this.#latestCopyPath = undefined;

    const timestamp: string = new Date(this.#nowMs()).toISOString().replace(/[:.]/g, '-');
    this.#fileName = `${timestamp}-${this.#pid}-${this.#actionName}.log`;
  }

  public async initializeAsync(): Promise<void> {
    await this.#ensureTargetAsync();
    this.#writeBufferedLines();
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    const line: string = this.#formatLine(event);
    if (this.#fileDescriptor === undefined) {
      if (!this.#targetResolved) {
        this.#lines.push(line);
      }
      return;
    }
    this.#writeLine(line);
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
    await this.flushAsync();
    if (this.#fileDescriptor !== undefined) {
      try {
        fs.closeSync(this.#fileDescriptor);
      } catch (error) {
        this.#available = false;
        this.#emergencyWarn(
          `[reporter] Unable to close the full-detail log; the artifact is unavailable: ${
            (error as Error).message
          }`
        );
      } finally {
        this.#fileDescriptor = undefined;
      }
    }
    await this.#refreshLatestCopyAsync();
  }

  /**
   * Returns the resolved log artifact.
   */
  public getArtifact(): IFileReporterArtifact {
    return this.#targetPath !== undefined
      ? { available: this.#available, path: this.#targetPath }
      : { available: this.#available };
  }

  #formatLine(event: IReporterEventEnvelope<unknown>): string {
    return `${JSON.stringify(redactReporterEvent(event))}\n`;
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

  #writeLine(line: string): boolean {
    if (this.#fileDescriptor === undefined) {
      return false;
    }
    try {
      fs.writeSync(this.#fileDescriptor, line, null, 'utf8');
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
    this.#lines.length = 0;
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
    this.#lines.length = 0;
    this.#emergencyWarn(
      `[reporter] Unable to write the full-detail log; the artifact is unavailable: ${
        lastError?.message ?? 'unknown error'
      }`
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
