// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporterEmitEventInput, IReporterEventSink } from '../producers/IReporterEventSink';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';
import type { IReporter, IReporterContext } from './IReporter';

/**
 * The default flush timeout for normal and error completion, in milliseconds.
 *
 * @beta
 */
export const DEFAULT_FLUSH_TIMEOUT_MS: number = 10000;

/**
 * The default best-effort flush timeout used on signal termination, in milliseconds.
 *
 * @beta
 */
export const DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS: number = 2000;

const DEFAULT_COALESCE_THRESHOLD: number = 64;

/**
 * Options for registering a reporter with a {@link ReporterManager}.
 *
 * @beta
 */
export interface IReporterRegistrationOptions {
  /**
   * An exclusive destination the reporter owns, such as `stdout` or a file path.
   * No two reporters may own the same destination; share one only through an
   * explicit multiplexer registered as a single reporter.
   */
  readonly destination?: string;

  /**
   * Whether a runtime failure of this reporter is fatal to the session. Required
   * reporters (such as the parent or wire reporter) are fatal; optional
   * reporters are disabled on failure. Defaults to `false`.
   */
  readonly required?: boolean;
}

/**
 * Options for constructing a {@link ReporterManager}.
 *
 * @beta
 */
export interface IReporterManagerOptions {
  /**
   * The protocol version the manager advertises to reporters. Defaults to
   * {@link REPORTER_PROTOCOL_VERSION}.
   */
  readonly protocolVersion?: IReporterProtocolVersion;

  /**
   * Returns the current timestamp as an ISO 8601 string. Injectable for testing.
   */
  readonly now?: () => string;

  /**
   * The pending-queue length at which replaceable status events begin to
   * coalesce. Defaults to 64.
   */
  readonly coalesceThreshold?: number;

  /**
   * Writes a one-line emergency diagnostic, used when an optional reporter is
   * disabled. Defaults to writing to `process.stderr`.
   */
  readonly emergencyDiagnosticWriter?: (message: string) => void;
}

interface IReporterEntry {
  readonly reporter: IReporter;
  readonly destination: string | undefined;
  readonly required: boolean;
  disabled: boolean;
  readonly queue: IReporterEventEnvelope<unknown>[];
  draining: boolean;
  drainPromise: Promise<void>;
}

/**
 * Assigns session ordering to events and fans them out to reporters.
 *
 * @remarks
 * The manager is the authoritative in-process sink. It assigns one monotonic
 * session `sequence`, `eventId`, and `timestamp` to each event, then delivers
 * events to each reporter through an independent ordered queue. It enforces
 * exclusive destination ownership, coalesces replaceable status events under
 * pressure, and never drops lifecycle, diagnostic, result, artifact, or
 * external-output events.
 *
 * @beta
 */
export class ReporterManager implements IReporterEventSink {
  private readonly _entries: IReporterEntry[];
  private readonly _ownedDestinations: Set<string>;
  private readonly _protocolVersion: IReporterProtocolVersion;
  private readonly _now: () => string;
  private readonly _coalesceThreshold: number;
  private readonly _emergencyDiagnosticWriter: (message: string) => void;
  private _nextSequence: number;
  private _nextEventId: number;
  private _initialized: boolean;
  private _fatalError: Error | undefined;

  public constructor(options: IReporterManagerOptions = {}) {
    this._entries = [];
    this._ownedDestinations = new Set();
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this._now = options.now ?? (() => new Date().toISOString());
    this._coalesceThreshold = options.coalesceThreshold ?? DEFAULT_COALESCE_THRESHOLD;
    this._emergencyDiagnosticWriter =
      options.emergencyDiagnosticWriter ??
      ((message: string) => {
        process.stderr.write(`${message}\n`);
      });
    this._nextSequence = 1;
    this._nextEventId = 1;
    this._initialized = false;
    this._fatalError = undefined;
  }

  /**
   * Registers a reporter and, optionally, the destination it exclusively owns.
   *
   * @throws Error if the destination is already owned, or if called after initialization
   */
  public addReporter(reporter: IReporter, options: IReporterRegistrationOptions = {}): void {
    if (this._initialized) {
      throw new Error('Reporters cannot be added after the manager is initialized.');
    }
    const destination: string | undefined = options.destination;
    if (destination !== undefined) {
      if (this._ownedDestinations.has(destination)) {
        throw new Error(
          `The destination ${JSON.stringify(destination)} is already owned by another reporter. ` +
            `Share a destination only through an explicit multiplexer.`
        );
      }
      this._ownedDestinations.add(destination);
    }
    this._entries.push({
      reporter,
      destination,
      required: options.required ?? false,
      disabled: false,
      queue: [],
      draining: false,
      drainPromise: Promise.resolve()
    });
  }

  /**
   * Initializes every registered reporter.
   *
   * @remarks
   * Initialization failure is fatal: the returned promise rejects with the first
   * reporter's error.
   */
  public async initializeAsync(): Promise<void> {
    for (const entry of this._entries) {
      const context: IReporterContext = {
        protocolVersion: this._protocolVersion,
        destination: entry.destination
      };
      await entry.reporter.initializeAsync(context);
    }
    this._initialized = true;
  }

  /**
   * Publishes an in-process event, assigning its `eventId`, `sequence`, and
   * `timestamp`, and returns the assigned `eventId`.
   */
  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    const eventId: string = `evt_${this._nextEventId++}`;
    const envelope: IReporterEventEnvelope<TPayload> = {
      ...event,
      eventId,
      sequence: this._nextSequence++,
      timestamp: this._now()
    };
    this._fanOut(envelope);
    return eventId;
  }

  /**
   * Ingests a fully-formed envelope received from a child session.
   *
   * @remarks
   * The manager assigns a new global `sequence` in receipt order and preserves
   * the producer's original sequence as `sourceSequence`.
   *
   * @returns the ingested event's `eventId`
   */
  public ingestForeignEnvelope(envelope: IReporterEventEnvelope<unknown>): string {
    const rehomed: IReporterEventEnvelope<unknown> = {
      ...envelope,
      sequence: this._nextSequence++,
      sourceSequence: envelope.sequence
    };
    this._fanOut(rehomed);
    return rehomed.eventId;
  }

  /**
   * Returns the total number of envelopes still buffered across all reporter
   * queues.
   *
   * @remarks
   * This is an observability hook for verifying bounded streaming: because each
   * queue drains incrementally and coalesces replaceable status events, the
   * pending count stays bounded rather than growing to the whole-build event
   * total. After {@link ReporterManager.flushAsync} resolves it is `0`.
   */
  public getPendingEventCount(): number {
    let total: number = 0;
    for (const entry of this._entries) {
      total += entry.queue.length;
    }
    return total;
  }

  /**
   * Drains every reporter queue and flushes each reporter, bounded by a timeout.
   *
   * @param timeoutMs - the flush timeout in milliseconds
   * @throws the captured fatal error if a required reporter failed
   */
  public async flushAsync(timeoutMs: number = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
    await this._settleAsync(async (entry: IReporterEntry): Promise<void> => {
      await entry.drainPromise;
      if (!entry.disabled) {
        await entry.reporter.flushAsync();
      }
    }, timeoutMs);
    if (this._fatalError) {
      throw this._fatalError;
    }
  }

  /**
   * Performs a best-effort flush suitable for signal termination.
   *
   * @remarks
   * Uses a short timeout and never throws, so a signal handler can call it
   * without risk.
   */
  public async signalFlushAsync(timeoutMs: number = DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS): Promise<void> {
    await this._settleAsync(async (entry: IReporterEntry): Promise<void> => {
      await entry.drainPromise;
      if (!entry.disabled) {
        await entry.reporter.flushAsync();
      }
    }, timeoutMs);
  }

  /**
   * Flushes and then closes every reporter, bounded by a timeout.
   *
   * @throws the captured fatal error if a required reporter failed
   */
  public async closeAsync(timeoutMs: number = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
    let flushError: Error | undefined;
    try {
      await this.flushAsync(timeoutMs);
    } catch (error) {
      flushError = error as Error;
    }
    await this._settleAsync(async (entry: IReporterEntry): Promise<void> => {
      if (!entry.disabled) {
        await entry.reporter.closeAsync();
      }
    }, timeoutMs);
    if (flushError) {
      throw flushError;
    }
  }

  private _fanOut(envelope: IReporterEventEnvelope<unknown>): void {
    for (const entry of this._entries) {
      if (!entry.disabled) {
        this._enqueue(entry, envelope);
      }
    }
  }

  private _enqueue(entry: IReporterEntry, envelope: IReporterEventEnvelope<unknown>): void {
    const lastIndex: number = entry.queue.length - 1;
    if (
      entry.queue.length >= this._coalesceThreshold &&
      this._isCoalescibleStatusEvent(envelope) &&
      lastIndex >= 0 &&
      this._isCoalescibleStatusEvent(entry.queue[lastIndex])
    ) {
      // Under pressure, a replaceable status event supersedes the previous
      // unsent one instead of growing the queue. Protected events are never
      // coalesced or dropped.
      entry.queue[lastIndex] = envelope;
    } else {
      entry.queue.push(envelope);
    }

    if (!entry.draining) {
      entry.draining = true;
      entry.drainPromise = this._drainEntryAsync(entry);
    }
  }

  private async _drainEntryAsync(entry: IReporterEntry): Promise<void> {
    try {
      while (entry.queue.length > 0) {
        const envelope: IReporterEventEnvelope<unknown> = entry.queue.shift()!;
        try {
          entry.reporter.report(envelope);
        } catch (error) {
          this._handleReporterFailure(entry, error as Error);
          if (entry.disabled) {
            entry.queue.length = 0;
            break;
          }
        }
        // Yield so producers and coalescing can interleave with delivery.
        await Promise.resolve();
      }
    } finally {
      entry.draining = false;
    }
  }

  private _handleReporterFailure(entry: IReporterEntry, error: Error): void {
    if (entry.required) {
      if (!this._fatalError) {
        this._fatalError = error;
      }
      this._emergencyDiagnosticWriter(
        `[reporter] Required reporter ${JSON.stringify(entry.reporter.name)} failed: ${error.message}`
      );
      return;
    }
    entry.disabled = true;
    this._emergencyDiagnosticWriter(
      `[reporter] Disabling optional reporter ${JSON.stringify(entry.reporter.name)} after failure: ${error.message}`
    );
  }

  private _isCoalescibleStatusEvent(envelope: IReporterEventEnvelope<unknown>): boolean {
    // Only non-required activity/liveness events are replaceable. Every other
    // event type, and any required event, must be delivered.
    return envelope.type === 'activityChanged' && !envelope.required;
  }

  private async _settleAsync(
    action: (entry: IReporterEntry) => Promise<void>,
    timeoutMs: number
  ): Promise<void> {
    const work: Promise<void> = Promise.all(
      this._entries.map((entry: IReporterEntry) =>
        action(entry).catch((error: Error) => {
          this._handleReporterFailure(entry, error);
        })
      )
    ).then(() => undefined);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout: Promise<void> = new Promise<void>((resolve: () => void) => {
      timer = setTimeout(resolve, timeoutMs);
    });

    try {
      await Promise.race([work, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
