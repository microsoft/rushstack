// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';
import type { IClassifiedDiagnosticValue } from '../diagnostics/IClassifiedDiagnosticValue';
import { computeEnvelopePrivacyFloor } from '../diagnostics/DiagnosticPrivacy';
import type { IReporterEmitEventInput, IReporterEventSink } from '../producers/IReporterEventSink';
import { isReporterExtensionEventName } from '../producers/ReporterExtensionEventName';
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

/**
 * The default pending-queue length at which replaceable status events begin to
 * coalesce.
 *
 * @beta
 */
export const DEFAULT_COALESCE_THRESHOLD: number = 64;

/**
 * The default per-reporter queue high-water mark, in events.
 *
 * @remarks
 * A reporter that cannot keep up with its producers would otherwise grow an
 * unbounded queue. Once the queue exceeds this many events, the manager sheds
 * replaceable status events first, then the oldest non-required events, and
 * writes one emergency diagnostic for the overflow episode.
 *
 * @beta
 */
export const DEFAULT_MAX_QUEUED_EVENTS_PER_REPORTER: number = 10000;

const MAX_EMERGENCY_LINE_LENGTH: number = 512;

/**
 * Collapses a message to a single, bounded emergency line.
 */
function sanitizeEmergencyLine(message: string): string {
  const singleLine: string = message.replace(/[\r\n\u2028\u2029\t]+/g, ' ').trim();
  return singleLine.length > MAX_EMERGENCY_LINE_LENGTH
    ? `${singleLine.slice(0, MAX_EMERGENCY_LINE_LENGTH - 3)}...`
    : singleLine;
}

/**
 * Describes a thrown value using its message only.
 *
 * @remarks
 * Stacks and other error internals are never written to an emergency line
 * because they can leak local paths and other sensitive detail.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Recursively freezes an event envelope so reporters observe an immutable snapshot.
 *
 * @remarks
 * This is deliberately a recursive `Object.freeze` rather than a structural
 * clone: fan-out is a hot path, and one shared frozen object is far cheaper
 * than one copy per reporter queue. Freezing happens before delivery, so a
 * producer that keeps a reference to a payload it emitted cannot mutate what
 * reporters see. An already-frozen subtree is skipped, which also terminates
 * recursion on cyclic structures.
 */
function freezeEventDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeEventDeep(child);
  }
  return value;
}

/**
 * Reads the namespaced identifier an extension event's payload declares.
 *
 * @remarks
 * The envelope has no dedicated field for it, so an extension payload carries
 * its identifier as `name` (or the more explicit `extensionName`).
 */
function getExtensionEventName(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const candidate: { readonly name?: unknown; readonly extensionName?: unknown } = payload as {
    readonly name?: unknown;
    readonly extensionName?: unknown;
  };
  if (typeof candidate.extensionName === 'string') {
    return candidate.extensionName;
  }
  if (typeof candidate.name === 'string') {
    return candidate.name;
  }
  return undefined;
}

/**
 * Collects the privacy classifications of a diagnostic payload's parameters.
 */
function getDiagnosticClassifications(payload: unknown): ReporterPrivacyClassification[] {
  const classifications: ReporterPrivacyClassification[] = [];
  if (typeof payload !== 'object' || payload === null) {
    return classifications;
  }
  const parameters: unknown = (payload as { readonly parameters?: unknown }).parameters;
  if (typeof parameters !== 'object' || parameters === null) {
    return classifications;
  }
  for (const parameter of Object.values(parameters as Record<string, IClassifiedDiagnosticValue>)) {
    if (typeof parameter === 'object' && parameter !== null && typeof parameter.privacy === 'string') {
      classifications.push(parameter.privacy);
    }
  }
  return classifications;
}

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
   * The identifier of the session this manager owns.
   *
   * @remarks
   * Locally minted event ids are qualified with this value so that they cannot
   * collide with the ids of events re-homed from a child session. When it is
   * omitted, the `sessionId` carried by each event is used instead.
   */
  readonly sessionId?: string;

  /**
   * Returns the current timestamp as an ISO 8601 string. Injectable for testing.
   */
  readonly now?: () => string;

  /**
   * The pending-queue length at which replaceable status events begin to
   * coalesce. Defaults to {@link DEFAULT_COALESCE_THRESHOLD}.
   */
  readonly coalesceThreshold?: number;

  /**
   * The per-reporter queue high-water mark, in events. Defaults to
   * {@link DEFAULT_MAX_QUEUED_EVENTS_PER_REPORTER}.
   *
   * @remarks
   * When a reporter's queue exceeds this length, replaceable status events are
   * shed first, then the oldest non-required events. Required events are never
   * dropped.
   */
  readonly maxQueuedEventsPerReporter?: number;

  /**
   * Writes a one-line emergency diagnostic, used when an optional reporter is
   * disabled. Defaults to writing to `process.stderr`.
   *
   * @remarks
   * The manager never lets this writer's own failure escape, because it is
   * invoked on paths (such as signal termination) where `process.stderr` may
   * already be closed.
   */
  readonly emergencyDiagnosticWriter?: (message: string) => void;
}

interface IReporterEntry {
  readonly reporter: IReporter;
  readonly destination: string | undefined;
  readonly required: boolean;
  initialized: boolean;
  disabled: boolean;
  failureReported: boolean;
  overflowReported: boolean;
  queue: IReporterEventEnvelope<unknown>[];
  /**
   * The number of events already removed from the front of `queue`, used to
   * translate the absolute indexes held by `coalesceSlots`.
   */
  queueOffset: number;
  /**
   * Maps a status stream key to the absolute index of the newest replaceable
   * event queued for that stream.
   */
  readonly coalesceSlots: Map<string, number>;
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
 * Envelopes are frozen before delivery, so every reporter observes the same
 * immutable snapshot regardless of what the producer does with the payload
 * afterwards.
 *
 * @beta
 */
export class ReporterManager implements IReporterEventSink {
  private readonly _entries: IReporterEntry[];
  private readonly _ownedDestinations: Set<string>;
  private readonly _protocolVersion: IReporterProtocolVersion;
  private readonly _sessionId: string | undefined;
  private readonly _now: () => string;
  private readonly _coalesceThreshold: number;
  private readonly _maxQueuedEventsPerReporter: number;
  private readonly _emergencyDiagnosticWriter: (message: string) => void;
  private _nextSequence: number;
  private _nextEventId: number;
  private _initialized: boolean;
  private _closing: boolean;
  private _closePromise: Promise<void> | undefined;
  private _fatalError: Error | undefined;

  public constructor(options: IReporterManagerOptions = {}) {
    this._entries = [];
    this._ownedDestinations = new Set();
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this._sessionId = options.sessionId;
    this._now = options.now ?? (() => new Date().toISOString());
    this._coalesceThreshold = options.coalesceThreshold ?? DEFAULT_COALESCE_THRESHOLD;
    this._maxQueuedEventsPerReporter =
      options.maxQueuedEventsPerReporter ?? DEFAULT_MAX_QUEUED_EVENTS_PER_REPORTER;
    this._emergencyDiagnosticWriter =
      options.emergencyDiagnosticWriter ??
      ((message: string) => {
        process.stderr.write(`${message}\n`);
      });
    this._nextSequence = 1;
    this._nextEventId = 1;
    this._initialized = false;
    this._closing = false;
    this._closePromise = undefined;
    this._fatalError = undefined;
  }

  /**
   * Registers a reporter and, optionally, the destination it exclusively owns.
   *
   * @throws Error if the destination is already owned, or if called after initialization
   */
  public addReporter(reporter: IReporter, options: IReporterRegistrationOptions = {}): void {
    if (this._closing) {
      throw new Error('Reporters cannot be added after the manager is closed.');
    }
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
      initialized: false,
      disabled: false,
      failureReported: false,
      overflowReported: false,
      queue: [],
      queueOffset: 0,
      coalesceSlots: new Map(),
      draining: false,
      drainPromise: Promise.resolve()
    });
  }

  /**
   * Initializes every registered reporter.
   *
   * @remarks
   * Initialization failure is fatal: the returned promise rejects with the first
   * reporter's error. Before rethrowing, the manager makes a best-effort attempt
   * to close the reporters it already initialized, so a partially initialized
   * session does not leak destinations. Reporters that never initialized are
   * skipped by later flush and close.
   *
   * @throws Error if the manager was already initialized or closed
   */
  public async initializeAsync(): Promise<void> {
    if (this._closing) {
      throw new Error('ReporterManager is closed and can no longer be initialized.');
    }
    if (this._initialized) {
      throw new Error('ReporterManager has already been initialized.');
    }
    for (const entry of this._entries) {
      const context: IReporterContext = {
        protocolVersion: this._protocolVersion,
        destination: entry.destination
      };
      try {
        await entry.reporter.initializeAsync(context);
      } catch (error) {
        await this._rollbackInitializationAsync();
        throw error;
      }
      entry.initialized = true;
    }
    this._initialized = true;
  }

  private async _rollbackInitializationAsync(): Promise<void> {
    for (const entry of this._entries) {
      if (!entry.initialized) {
        continue;
      }
      entry.initialized = false;
      try {
        await entry.reporter.closeAsync();
      } catch (error) {
        this._writeEmergencyDiagnostic(
          `[reporter] Reporter ${JSON.stringify(entry.reporter.name)} failed to close while rolling ` +
            `back a failed initialization: ${describeError(error)}`
        );
      }
    }
  }

  /**
   * Publishes an in-process event, assigning its `eventId`, `sequence`, and
   * `timestamp`, and returns the assigned `eventId`.
   *
   * @remarks
   * The event id is qualified with the session id, so ids minted here can never
   * collide with the ids of events re-homed from a child session. The envelope
   * is frozen before delivery; producers must not mutate a payload after
   * emitting it.
   *
   * For a `diagnosticEmitted` event whose payload carries classified
   * parameters, the envelope `privacy` is replaced with the computed floor. The
   * envelope value is defined as the minimum classification floor of every
   * field, so it is derived rather than declared; field-level classification
   * remains authoritative for redaction.
   *
   * @throws Error if the manager is not initialized, is closing, or the event is invalid
   */
  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    this._ensureAcceptingEvents();
    this._validateEmitInput(event);
    const eventId: string = this._mintEventId(event.sessionId);
    const envelope: IReporterEventEnvelope<TPayload> = {
      ...event,
      privacy: this._resolvePrivacy(event),
      eventId,
      sequence: this._nextSequence++,
      timestamp: this._now()
    };
    this._fanOut(freezeEventDeep(envelope));
    return eventId;
  }

  /**
   * Ingests a fully-formed envelope received from a child session.
   *
   * @remarks
   * The manager assigns a new global `sequence` in receipt order and preserves
   * the producer's original sequence as `sourceSequence`. An envelope that was
   * already re-homed once keeps the original producer's `sourceSequence`, so a
   * grandchild's local ordering survives every hop.
   *
   * The child's `eventId` is replaced with a locally minted id, because a child
   * cannot guarantee uniqueness within this session's stream. The origin remains
   * identifiable through the envelope's `sessionId` and `sourceSequence`.
   *
   * @returns the ingested event's newly assigned `eventId`
   *
   * @throws Error if the manager is not initialized or is closing
   */
  public ingestForeignEnvelope(envelope: IReporterEventEnvelope<unknown>): string {
    this._ensureAcceptingEvents();
    const eventId: string = this._mintEventId(envelope.sessionId);
    const rehomed: IReporterEventEnvelope<unknown> = {
      ...envelope,
      eventId,
      sequence: this._nextSequence++,
      sourceSequence: envelope.sourceSequence ?? envelope.sequence
    };
    this._fanOut(freezeEventDeep(rehomed));
    return eventId;
  }

  /**
   * Drains every reporter queue and flushes each reporter, bounded by a timeout.
   *
   * @remarks
   * A reporter that does not flush within the timeout is abandoned and reported
   * through one emergency diagnostic. Once the manager is closing, this is a
   * no-op because {@link ReporterManager.closeAsync} performs the final flush.
   *
   * @param timeoutMs - the flush timeout in milliseconds
   * @throws the captured fatal error if a required reporter failed; the error is
   * consumed, so a later flush does not report it again
   */
  public async flushAsync(timeoutMs: number = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
    if (this._closing) {
      return;
    }
    await this._flushEntriesAsync(this._getInitializedEntries(), timeoutMs);
    const fatalError: Error | undefined = this._consumeFatalError();
    if (fatalError) {
      throw fatalError;
    }
  }

  /**
   * Performs a best-effort flush suitable for signal termination.
   *
   * @remarks
   * Uses a short timeout and never throws, so a signal handler can call it
   * without risk. Even a failure of the emergency diagnostic writer itself, such
   * as an `EPIPE` while the process is being torn down, is swallowed.
   */
  public async signalFlushAsync(timeoutMs: number = DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS): Promise<void> {
    try {
      await this._flushEntriesAsync(this._getInitializedEntries(), timeoutMs);
    } catch {
      // A signal flush is best effort and must never throw into a signal handler.
    }
  }

  /**
   * Flushes and then closes every reporter, bounded by a single timeout budget.
   *
   * @remarks
   * The call is idempotent: repeated calls return the promise created by the
   * first call and never close a reporter twice. Flush and close share one
   * timeout budget rather than one budget each, and a reporter whose flush is
   * still in flight when the budget expires is not closed, because
   * {@link IReporter} is never called concurrently with itself.
   *
   * @throws the first captured fatal error if a required reporter failed during
   * flush or close
   */
  public async closeAsync(timeoutMs: number = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
    if (!this._closePromise) {
      this._closing = true;
      this._closePromise = this._closeInternalAsync(timeoutMs);
    }
    return this._closePromise;
  }

  private async _closeInternalAsync(timeoutMs: number): Promise<void> {
    const deadline: number = Date.now() + Math.max(0, timeoutMs);
    const entries: IReporterEntry[] = this._getInitializedEntries();
    const abandoned: IReporterEntry[] = await this._flushEntriesAsync(entries, deadline - Date.now());
    // A reporter whose flush never settled is still running inside the reporter,
    // so calling closeAsync() on it would break the no-concurrent-calls contract.
    const stillFlushing: Set<IReporterEntry> = new Set(abandoned);
    const closable: IReporterEntry[] = entries.filter(
      (entry: IReporterEntry) => !stillFlushing.has(entry)
    );
    // Disabled reporters are still closed: they own a destination that has to be
    // released even though they no longer receive events.
    await this._settleAsync(
      closable,
      async (entry: IReporterEntry): Promise<void> => {
        entry.initialized = false;
        await entry.reporter.closeAsync();
      },
      deadline - Date.now()
    );
    const fatalError: Error | undefined = this._consumeFatalError();
    if (fatalError) {
      throw fatalError;
    }
  }

  private _fanOut(envelope: IReporterEventEnvelope<unknown>): void {
    for (const entry of this._entries) {
      if (!entry.disabled) {
        this._enqueue(entry, envelope);
      }
    }
  }

  private _ensureAcceptingEvents(): void {
    if (!this._initialized) {
      throw new Error('ReporterManager must be initialized before publishing events.');
    }
    if (this._closing) {
      throw new Error('ReporterManager is closed and can no longer publish events.');
    }
  }

  private _getInitializedEntries(): IReporterEntry[] {
    return this._entries.filter((entry: IReporterEntry) => entry.initialized);
  }

  private _mintEventId(eventSessionId: string): string {
    return `${this._sessionId ?? eventSessionId}:evt_${this._nextEventId++}`;
  }

  private _validateEmitInput(event: IReporterEmitEventInput<unknown>): void {
    if (event.type !== 'extension') {
      return;
    }
    const name: string | undefined = getExtensionEventName(event.payload);
    if (name === undefined || !isReporterExtensionEventName(name)) {
      throw new Error(
        `An extension event must carry a namespaced beta identifier such as "acme.cache-warmed" in ` +
          `its payload "name" field; received ${JSON.stringify(name)}.`
      );
    }
  }

  private _resolvePrivacy(event: IReporterEmitEventInput<unknown>): ReporterPrivacyClassification {
    if (event.type !== 'diagnosticEmitted') {
      return event.privacy;
    }
    const classifications: ReporterPrivacyClassification[] = getDiagnosticClassifications(event.payload);
    if (classifications.length === 0) {
      return event.privacy;
    }
    // The envelope classification is defined as the floor over the event's
    // classified fields, so it is computed rather than trusted: a producer
    // cannot label an event more or less sensitive than the fields it carries.
    return computeEnvelopePrivacyFloor(classifications);
  }

  private _enqueue(entry: IReporterEntry, envelope: IReporterEventEnvelope<unknown>): void {
    const streamKey: string | undefined = this._getCoalesceStreamKey(envelope);
    if (streamKey !== undefined && entry.queue.length >= this._coalesceThreshold) {
      const absoluteIndex: number | undefined = entry.coalesceSlots.get(streamKey);
      if (absoluteIndex !== undefined) {
        const queueIndex: number = absoluteIndex - entry.queueOffset;
        if (
          queueIndex >= 0 &&
          queueIndex < entry.queue.length &&
          this._getCoalesceStreamKey(entry.queue[queueIndex]) === streamKey
        ) {
          // Under pressure, a replaceable status event supersedes the previous
          // unsent event of the same stream instead of growing the queue. Other
          // streams keep their own latest status, so a project's terminal status
          // is never lost to an unrelated project's chatter. Protected events are
          // never coalesced or dropped.
          entry.queue[queueIndex] = envelope;
          this._scheduleDrain(entry);
          return;
        }
        entry.coalesceSlots.delete(streamKey);
      }
    }

    entry.queue.push(envelope);
    if (streamKey !== undefined) {
      entry.coalesceSlots.set(streamKey, entry.queueOffset + entry.queue.length - 1);
    }
    if (entry.queue.length > this._maxQueuedEventsPerReporter) {
      this._shedOverflow(entry);
    }
    this._scheduleDrain(entry);
  }

  /**
   * Bounds a reporter queue that has exceeded its high-water mark.
   *
   * @remarks
   * Replaceable status events are shed first. If the queue is still over the
   * mark, the oldest non-required events are shed as a last resort so that an
   * unresponsive reporter cannot exhaust memory. Required events are never
   * dropped, and the episode produces exactly one emergency diagnostic instead
   * of one line per dropped event.
   */
  private _shedOverflow(entry: IReporterEntry): void {
    const limit: number = this._maxQueuedEventsPerReporter;
    let excess: number = entry.queue.length - limit;
    if (excess <= 0) {
      return;
    }

    let droppedReplaceable: number = 0;
    let kept: IReporterEventEnvelope<unknown>[] = [];
    for (const queued of entry.queue) {
      if (excess > 0 && this._getCoalesceStreamKey(queued) !== undefined) {
        excess--;
        droppedReplaceable++;
        continue;
      }
      kept.push(queued);
    }

    let droppedOptional: number = 0;
    if (excess > 0) {
      const survivors: IReporterEventEnvelope<unknown>[] = [];
      for (const queued of kept) {
        if (excess > 0 && !queued.required) {
          excess--;
          droppedOptional++;
          continue;
        }
        survivors.push(queued);
      }
      kept = survivors;
    }

    entry.queue = kept;
    entry.queueOffset = 0;
    entry.coalesceSlots.clear();
    for (let index: number = 0; index < entry.queue.length; index++) {
      const streamKey: string | undefined = this._getCoalesceStreamKey(entry.queue[index]);
      if (streamKey !== undefined) {
        entry.coalesceSlots.set(streamKey, index);
      }
    }

    if (!entry.overflowReported) {
      entry.overflowReported = true;
      this._writeEmergencyDiagnostic(
        `[reporter] Reporter ${JSON.stringify(entry.reporter.name)} exceeded its queue limit of ` +
          `${limit} events; dropped ${droppedReplaceable} replaceable and ${droppedOptional} ` +
          `non-required events.`
      );
    }
  }

  private _scheduleDrain(entry: IReporterEntry): void {
    if (entry.draining) {
      return;
    }
    entry.draining = true;
    entry.drainPromise = this._drainEntryAsync(entry);
  }

  private async _drainEntryAsync(entry: IReporterEntry): Promise<void> {
    // Yield first so `entry.drainPromise` is assigned before any reporter code
    // runs. Otherwise the first report() of a cycle would execute synchronously
    // inside emit(), and a reporter that re-entered the manager would observe a
    // stale drain promise.
    await Promise.resolve();
    try {
      while (entry.queue.length > 0) {
        const envelope: IReporterEventEnvelope<unknown> = entry.queue.shift()!;
        entry.queueOffset++;
        try {
          entry.reporter.report(envelope);
        } catch (error) {
          this._handleReporterFailure(entry, error);
          if (entry.disabled) {
            this._clearQueue(entry);
            break;
          }
        }
        // Yield so producers and coalescing can interleave with delivery.
        await Promise.resolve();
      }
      if (entry.queue.length === 0) {
        // The queue drained, so the overflow episode (if any) is over and the
        // stale coalescing slots can be released.
        entry.coalesceSlots.clear();
        entry.overflowReported = false;
      }
    } finally {
      entry.draining = false;
    }
  }

  private _clearQueue(entry: IReporterEntry): void {
    entry.queueOffset += entry.queue.length;
    entry.queue.length = 0;
    entry.coalesceSlots.clear();
  }

  /**
   * Records a reporter failure, writing at most one emergency diagnostic per reporter.
   *
   * @remarks
   * The failed reporter stops receiving events, whether it is optional or
   * required, so a reporter that fails on every event produces one emergency
   * line rather than one line per event. A required reporter additionally
   * captures a fatal error that the next flush or close reports once.
   */
  private _handleReporterFailure(entry: IReporterEntry, error: unknown): void {
    const alreadyReported: boolean = entry.failureReported;
    entry.failureReported = true;
    entry.disabled = true;
    if (entry.required && !this._fatalError) {
      this._fatalError = error instanceof Error ? error : new Error(String(error));
    }
    if (alreadyReported) {
      return;
    }
    if (entry.required) {
      this._writeEmergencyDiagnostic(
        `[reporter] Required reporter ${JSON.stringify(entry.reporter.name)} failed: ` +
          `${describeError(error)}`
      );
      return;
    }
    this._writeEmergencyDiagnostic(
      `[reporter] Disabling optional reporter ${JSON.stringify(entry.reporter.name)} after failure: ` +
        `${describeError(error)}`
    );
  }

  private _consumeFatalError(): Error | undefined {
    const fatalError: Error | undefined = this._fatalError;
    this._fatalError = undefined;
    return fatalError;
  }

  private _writeEmergencyDiagnostic(message: string): void {
    try {
      this._emergencyDiagnosticWriter(sanitizeEmergencyLine(message));
    } catch {
      // The emergency writer is the last resort. Its own failure, such as an
      // EPIPE while the process is terminating, must never propagate.
    }
  }

  /**
   * Returns the coalescing stream key for a replaceable status event, or
   * `undefined` when the event must be delivered.
   *
   * @remarks
   * Only non-required activity/liveness events are replaceable. Every other
   * event type, and any required event, must be delivered. Replaceable events
   * are keyed by the stream they describe so that two projects reporting
   * activity concurrently never overwrite each other.
   */
  private _getCoalesceStreamKey(envelope: IReporterEventEnvelope<unknown>): string | undefined {
    if (envelope.type !== 'activityChanged' || envelope.required) {
      return undefined;
    }
    const operationId: string | undefined = envelope.scope?.operationId;
    if (operationId !== undefined) {
      return `operation\u0000${operationId}`;
    }
    const projectName: string | undefined = envelope.scope?.projectName;
    const phaseName: string | undefined = envelope.scope?.phaseName;
    if (projectName !== undefined || phaseName !== undefined) {
      return `project\u0000${projectName ?? ''}\u0000${phaseName ?? ''}`;
    }
    return `command\u0000${envelope.scope?.commandName ?? ''}`;
  }

  private async _flushEntryAsync(entry: IReporterEntry): Promise<void> {
    // Wait for delivery to become quiescent: a drain that starts while an
    // earlier one is finishing replaces `drainPromise`.
    let awaited: Promise<void> | undefined;
    while (entry.drainPromise !== awaited) {
      awaited = entry.drainPromise;
      await awaited;
    }
    if (entry.disabled) {
      return;
    }
    await entry.reporter.flushAsync();
  }

  private async _flushEntriesAsync(
    entries: readonly IReporterEntry[],
    timeoutMs: number
  ): Promise<IReporterEntry[]> {
    const abandoned: IReporterEntry[] = await this._settleAsync(
      entries,
      async (entry: IReporterEntry): Promise<void> => {
        await this._flushEntryAsync(entry);
      },
      timeoutMs
    );
    for (const entry of abandoned) {
      this._writeEmergencyDiagnostic(
        `[reporter] Reporter ${JSON.stringify(entry.reporter.name)} did not finish flushing within ` +
          `${Math.max(0, timeoutMs)}ms; its buffered output may be incomplete.`
      );
    }
    return abandoned;
  }

  /**
   * Runs an action for every entry, bounded by a timeout.
   *
   * @returns the entries whose action had not settled when the timeout elapsed;
   * their work is abandoned but still running, so no further reporter call may
   * be made on them
   */
  private async _settleAsync(
    entries: readonly IReporterEntry[],
    action: (entry: IReporterEntry) => Promise<void>,
    timeoutMs: number
  ): Promise<IReporterEntry[]> {
    if (entries.length === 0) {
      return [];
    }

    const settled: boolean[] = entries.map(() => false);
    const work: Promise<void> = Promise.all(
      entries.map(async (entry: IReporterEntry, index: number): Promise<void> => {
        try {
          await action(entry);
        } catch (error) {
          this._handleReporterFailure(entry, error);
        }
        settled[index] = true;
      })
    ).then(() => undefined);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout: Promise<void> = new Promise<void>((resolve: () => void) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });

    try {
      await Promise.race([work, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }

    const abandoned: IReporterEntry[] = [];
    for (let index: number = 0; index < entries.length; index++) {
      if (!settled[index]) {
        abandoned.push(entries[index]);
      }
    }
    return abandoned;
  }
}
