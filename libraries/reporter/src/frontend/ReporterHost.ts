// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import { ReporterManager } from '../manager/ReporterManager';
import { RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR } from '../bootstrap/BootstrapProtocol';
import {
  readBootstrapHandoffFileAsync,
  deleteBootstrapHandoffFileAsync,
  isBootstrapHandoffFileName
} from '../bootstrap/BootstrapHandoff';

/**
 * The default retention window for abandoned handoff files (14 days), in milliseconds.
 *
 * @beta
 */
export const DEFAULT_HANDOFF_RETENTION_MS: number = 14 * 24 * 60 * 60 * 1000;

/**
 * Options for constructing a {@link ReporterHost}.
 *
 * @beta
 */
export interface IReporterHostOptions {
  /**
   * The manager the host owns. A new {@link ReporterManager} is created when omitted.
   */
  readonly manager?: ReporterManager;

  /**
   * The environment variables consulted for the bootstrap handoff path. Defaults
   * to `process.env`.
   */
  readonly env?: Record<string, string | undefined>;

  /**
   * The directory scanned for abandoned handoff files. Defaults to the OS temp folder.
   */
  readonly handoffDirectory?: string;

  /**
   * The retention window for abandoned handoff files. Defaults to 14 days.
   */
  readonly retentionMs?: number;

  /**
   * Returns the current time in milliseconds. Injectable for testing.
   */
  readonly nowMs?: () => number;
}

/**
 * The outcome of replaying the bootstrap handoff.
 *
 * @beta
 */
export interface IBootstrapReplayResult {
  /**
   * Whether this was a direct invocation with no handoff file to replay.
   */
  readonly direct: boolean;

  /**
   * Whether handoff events were replayed.
   */
  readonly replayed: boolean;

  /**
   * The number of events replayed.
   */
  readonly eventCount: number;

  /**
   * The handoff file path, when one was present.
   */
  readonly handoffPath?: string;
}

/**
 * Hosts the authoritative {@link ReporterManager} in the frontend, before Rush
 * version selection.
 *
 * @remarks
 * The frontend creates the host, registers reporters, replays the bootstrap
 * handoff, and hands the selected `rush-lib` a typed {@link IReporterEventSink}.
 * `rush-lib` receives only the sink, so it can emit events but cannot select
 * reporters or own the session.
 *
 * @beta
 */
export class ReporterHost {
  private readonly _manager: ReporterManager;
  private readonly _env: Record<string, string | undefined>;
  private readonly _handoffDirectory: string;
  private readonly _retentionMs: number;
  private readonly _nowMs: () => number;

  public constructor(options: IReporterHostOptions = {}) {
    this._manager = options.manager ?? new ReporterManager();
    this._env = options.env ?? process.env;
    this._handoffDirectory = options.handoffDirectory ?? os.tmpdir();
    this._retentionMs = options.retentionMs ?? DEFAULT_HANDOFF_RETENTION_MS;
    this._nowMs = options.nowMs ?? (() => Date.now());
  }

  /**
   * The manager the host owns, used by the frontend to register reporters.
   */
  public get manager(): ReporterManager {
    return this._manager;
  }

  /**
   * Returns the typed sink handed to the selected `rush-lib`.
   *
   * @remarks
   * The return type is narrowed to {@link IReporterEventSink} so the engine
   * cannot register reporters, flush, or otherwise own selection.
   */
  public getSink(): IReporterEventSink {
    return this._manager;
  }

  /**
   * Replays the bootstrap handoff file into the manager and deletes it.
   *
   * @remarks
   * When the private handoff environment variable is absent, this was a direct
   * `rush` invocation and there is nothing to replay. A missing or unreadable
   * handoff file is tolerated: the frontend continues without replay.
   */
  public async replayBootstrapHandoffAsync(): Promise<IBootstrapReplayResult> {
    const handoffPath: string | undefined = this._env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR];
    if (!handoffPath) {
      return { direct: true, replayed: false, eventCount: 0 };
    }

    let events: unknown[];
    try {
      events = await readBootstrapHandoffFileAsync(handoffPath);
    } catch {
      // The handoff file is missing or corrupt; continue without replay.
      await deleteBootstrapHandoffFileAsync(handoffPath);
      return { direct: false, replayed: false, eventCount: 0, handoffPath };
    }

    for (const event of events) {
      this._manager.ingestForeignEnvelope(event as IReporterEventEnvelope<unknown>);
    }
    await deleteBootstrapHandoffFileAsync(handoffPath);
    return { direct: false, replayed: true, eventCount: events.length, handoffPath };
  }

  /**
   * Deletes abandoned handoff files older than the retention window.
   *
   * @returns the paths of the deleted files
   */
  public async cleanAbandonedHandoffFilesAsync(): Promise<string[]> {
    const deleted: string[] = [];
    let fileNames: string[];
    try {
      fileNames = await fs.promises.readdir(this._handoffDirectory);
    } catch {
      return deleted;
    }

    const cutoff: number = this._nowMs() - this._retentionMs;
    for (const fileName of fileNames) {
      if (!isBootstrapHandoffFileName(fileName)) {
        continue;
      }
      const filePath: string = path.join(this._handoffDirectory, fileName);
      try {
        const stats: fs.Stats = await fs.promises.stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await fs.promises.rm(filePath, { force: true });
          deleted.push(filePath);
        }
      } catch {
        // Ignore files that vanish or cannot be inspected.
      }
    }
    return deleted;
  }
}
