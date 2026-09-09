// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { ReporterEventType } from '../events/ReporterEventType';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import { REPORTER_EVENT_TYPES } from '../events/ReporterEventType';
import { ReporterManager } from '../manager/ReporterManager';
import { REPORTER_PROTOCOL_VERSION, isReporterProtocolCompatible } from '../protocol/ReporterProtocol';
import {
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR
} from '../bootstrap/BootstrapProtocol';
import {
  readBootstrapHandoffFileAsync,
  deleteBootstrapHandoffFileAsync,
  isBootstrapHandoffFileName,
  type IBootstrapHandoffHeader
} from '../bootstrap/BootstrapHandoff';

/**
 * The default retention window for abandoned handoff files (14 days), in milliseconds.
 *
 * @beta
 */
export const DEFAULT_HANDOFF_RETENTION_MS: number = 14 * 24 * 60 * 60 * 1000;

const MAX_ABANDONED_HANDOFF_SESSIONS: number = 20;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

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

  /**
   * The protocol version supported by this host. Defaults to the current version.
   */
  readonly supportedProtocolVersion?: IReporterProtocolVersion;
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
   * The number of malformed or unsupported records that were discarded.
   */
  readonly skippedEventCount?: number;

  /**
   * The handoff file path, when one was present.
   */
  readonly handoffPath?: string;

  /**
   * The reason no events were replayed, when a handoff path was present.
   * `nonce-mismatch` means the file failed authentication and was rejected.
   */
  readonly skipReason?:
    | 'unreadable'
    | 'invalid-path'
    | 'nonce-mismatch'
    | 'invalid-event'
    | 'unsupported-required-event'
    | 'incompatible-protocol';

  /**
   * Ordered raw output that a legacy fallback can render when the handoff
   * protocol is incompatible.
   */
  readonly legacyFallbackOutput?: readonly IBootstrapLegacyOutput[];
}

/**
 * A raw bootstrap write retained for legacy-visible fallback.
 *
 * @beta
 */
export interface IBootstrapLegacyOutput {
  /**
   * The original output stream.
   */
  readonly stream: 'stdout' | 'stderr';

  /**
   * The unmodified output text.
   */
  readonly text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getProtocolVersion(value: unknown): IReporterProtocolVersion | undefined {
  if (!isRecord(value) || !isRecord(value.protocolVersion)) {
    return undefined;
  }
  const { major, minor } = value.protocolVersion;
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor)
    ? { major: major as number, minor: minor as number }
    : undefined;
}

function isReporterEventEnvelope(value: unknown): value is IReporterEventEnvelope<unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const protocolVersion: unknown = value.protocolVersion;
  const source: unknown = value.source;
  return (
    isRecord(protocolVersion) &&
    getProtocolVersion(value) !== undefined &&
    typeof value.eventId === 'string' &&
    typeof value.sessionId === 'string' &&
    Number.isSafeInteger(value.sequence) &&
    typeof value.timestamp === 'string' &&
    isRecord(source) &&
    typeof source.packageName === 'string' &&
    typeof source.packageVersion === 'string' &&
    (value.privacy === 'public' || value.privacy === 'local-sensitive' || value.privacy === 'secret') &&
    typeof value.required === 'boolean' &&
    typeof value.type === 'string' &&
    REPORTER_EVENT_TYPES.includes(value.type as ReporterEventType) &&
    Object.hasOwn(value, 'payload')
  );
}

function getLegacyFallbackOutput(events: readonly unknown[]): IBootstrapLegacyOutput[] {
  const output: IBootstrapLegacyOutput[] = [];
  for (const event of events) {
    if (!isRecord(event) || !isRecord(event.payload)) {
      continue;
    }
    if (
      event.type === 'externalOutput' &&
      (event.payload.stream === 'stdout' || event.payload.stream === 'stderr') &&
      typeof event.payload.text === 'string' &&
      event.payload.wasRendered !== true
    ) {
      output.push({ stream: event.payload.stream, text: event.payload.text });
    } else if (event.type === 'activityChanged' && typeof event.payload.text === 'string') {
      output.push({ stream: 'stdout', text: `${event.payload.text}\n` });
    }
  }
  return output;
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
  private readonly _supportedProtocolVersion: IReporterProtocolVersion;

  public constructor(options: IReporterHostOptions = {}) {
    this._manager = options.manager ?? new ReporterManager();
    this._env = options.env ?? process.env;
    this._handoffDirectory = options.handoffDirectory ?? os.tmpdir();
    this._retentionMs = options.retentionMs ?? DEFAULT_HANDOFF_RETENTION_MS;
    this._nowMs = options.nowMs ?? (() => Date.now());
    this._supportedProtocolVersion = options.supportedProtocolVersion ?? REPORTER_PROTOCOL_VERSION;
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
   * handoff file is tolerated: the frontend continues without replay. When a
   * The manager must be initialized before this method is called. Both private
   * handoff environment variables must be present, the path must identify a
   * handoff in the configured directory, and the header nonce must match.
   */
  public async replayBootstrapHandoffAsync(): Promise<IBootstrapReplayResult> {
    const handoffPath: string | undefined = this._env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR];
    if (!handoffPath) {
      return { direct: true, replayed: false, eventCount: 0 };
    }

    if (!this._isOwnedHandoffPath(handoffPath)) {
      return {
        direct: false,
        replayed: false,
        eventCount: 0,
        handoffPath,
        skipReason: 'invalid-path'
      };
    }

    const expectedNonce: string | undefined = this._env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR];
    if (!expectedNonce) {
      return {
        direct: false,
        replayed: false,
        eventCount: 0,
        handoffPath,
        skipReason: 'nonce-mismatch'
      };
    }

    let header: IBootstrapHandoffHeader | undefined;
    let events: unknown[];
    let discardedRecordCount: number;
    try {
      ({ header, events, discardedRecordCount } = await readBootstrapHandoffFileAsync(handoffPath));
    } catch {
      // The handoff file is missing or corrupt; continue without replay.
      await deleteBootstrapHandoffFileAsync(handoffPath);
      return { direct: false, replayed: false, eventCount: 0, handoffPath, skipReason: 'unreadable' };
    }

    if (header?.nonce !== expectedNonce) {
      // The file was not written by the bootstrap process that set this
      // environment (stale or foreign handoff); reject it.
      return { direct: false, replayed: false, eventCount: 0, handoffPath, skipReason: 'nonce-mismatch' };
    }

    const acceptedEvents: IReporterEventEnvelope<unknown>[] = [];
    let skippedEventCount: number = discardedRecordCount;
    for (const event of events) {
      const protocolVersion: IReporterProtocolVersion | undefined = getProtocolVersion(event);
      if (protocolVersion && !isReporterProtocolCompatible(this._supportedProtocolVersion, protocolVersion)) {
        const legacyFallbackOutput: IBootstrapLegacyOutput[] = getLegacyFallbackOutput(events);
        await deleteBootstrapHandoffFileAsync(handoffPath);
        return {
          direct: false,
          replayed: false,
          eventCount: 0,
          handoffPath,
          skipReason: 'incompatible-protocol',
          ...(legacyFallbackOutput.length > 0 ? { legacyFallbackOutput } : {})
        };
      }
      if (!isReporterEventEnvelope(event)) {
        if (isRecord(event) && event.required === true) {
          const legacyFallbackOutput: IBootstrapLegacyOutput[] = getLegacyFallbackOutput(events);
          await deleteBootstrapHandoffFileAsync(handoffPath);
          return {
            direct: false,
            replayed: false,
            eventCount: 0,
            handoffPath,
            skipReason: 'unsupported-required-event',
            ...(legacyFallbackOutput.length > 0 ? { legacyFallbackOutput } : {})
          };
        }
        skippedEventCount++;
        continue;
      }
      acceptedEvents.push(event);
    }

    if (acceptedEvents.length === 0 && skippedEventCount > 0) {
      await deleteBootstrapHandoffFileAsync(handoffPath);
      return {
        direct: false,
        replayed: false,
        eventCount: 0,
        handoffPath,
        skipReason: 'invalid-event',
        skippedEventCount
      };
    }

    try {
      for (const event of acceptedEvents) {
        this._manager.ingestForeignEnvelope(event);
      }
    } finally {
      await deleteBootstrapHandoffFileAsync(handoffPath);
    }
    return {
      direct: false,
      replayed: true,
      eventCount: acceptedEvents.length,
      handoffPath,
      ...(skippedEventCount > 0 ? { skippedEventCount } : {})
    };
  }

  /**
   * Deletes the current authenticated bootstrap handoff without replaying it.
   *
   * @remarks
   * This is used when frontend initialization fails before replay can begin.
   * Paths outside the configured handoff directory and nonce mismatches are
   * rejected without deleting the referenced file.
   *
   */
  public async discardBootstrapHandoffAsync(): Promise<void> {
    const handoffPath: string | undefined = this._env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR];
    const expectedNonce: string | undefined = this._env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR];
    if (!handoffPath || !expectedNonce || !this._isOwnedHandoffPath(handoffPath)) {
      return;
    }

    try {
      const { header } = await readBootstrapHandoffFileAsync(handoffPath);
      if (header?.nonce !== expectedNonce) {
        return;
      }
    } catch {
      // Match replay behavior for an unreadable file at an authenticated private path.
    }

    await deleteBootstrapHandoffFileAsync(handoffPath);
  }

  /**
   * Deletes expired abandoned handoffs and retains at most 20 recent abandoned sessions per user.
   * Live processes, the current handoff, and files without verifiable ownership are protected.
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

    const uid: number = process.getuid?.() ?? os.userInfo().uid;
    if (uid < 0) {
      return deleted;
    }
    const currentHandoff: string | undefined = this._env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR];
    const cutoff: number = this._nowMs() - this._retentionMs;
    const abandoned: Array<{ path: string; pid: number; stats: fs.Stats }> = [];
    for (const fileName of fileNames) {
      const match: RegExpExecArray | null = /^rush-reporter-bootstrap-([1-9]\d*)-.+\.ndjson$/.exec(fileName);
      if (!match) {
        continue;
      }
      const pid: number = Number(match[1]);
      const filePath: string = path.join(this._handoffDirectory, fileName);
      if (
        !Number.isSafeInteger(pid) ||
        pid > 0x7fffffff ||
        pid === process.pid ||
        (currentHandoff !== undefined && path.resolve(filePath) === path.resolve(currentHandoff))
      ) {
        continue;
      }
      try {
        const stats: fs.Stats = await fs.promises.lstat(filePath);
        if (stats.isFile() && stats.uid === uid && !isProcessAlive(pid)) {
          abandoned.push({ path: filePath, pid, stats });
        }
      } catch {
        // Ignore files that vanish or cannot be inspected.
      }
    }
    abandoned.sort(
      (left, right) =>
        right.stats.mtimeMs - left.stats.mtimeMs ||
        (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    );
    for (const [index, candidate] of abandoned.entries()) {
      if (index < MAX_ABANDONED_HANDOFF_SESSIONS && candidate.stats.mtimeMs >= cutoff) {
        continue;
      }
      try {
        const stats: fs.Stats = await fs.promises.lstat(candidate.path);
        if (
          stats.isFile() &&
          stats.uid === uid &&
          stats.dev === candidate.stats.dev &&
          stats.ino === candidate.stats.ino &&
          stats.mtimeMs === candidate.stats.mtimeMs &&
          !isProcessAlive(candidate.pid)
        ) {
          await fs.promises.unlink(candidate.path);
          deleted.push(candidate.path);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          process.stderr.write(
            `[reporter] Unable to remove an abandoned bootstrap handoff: ${String(error)}\n`
          );
        }
      }
    }
    return deleted;
  }

  private _isOwnedHandoffPath(handoffPath: string): boolean {
    const resolvedPath: string = path.resolve(handoffPath);
    return (
      path.dirname(resolvedPath) === path.resolve(this._handoffDirectory) &&
      isBootstrapHandoffFileName(path.basename(resolvedPath))
    );
  }
}
