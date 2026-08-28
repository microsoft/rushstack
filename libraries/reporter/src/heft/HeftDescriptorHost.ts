// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import {
  REPORTER_EVENT_TYPES,
  isReporterEventRequired,
  type ReporterEventType
} from '../events/ReporterEventType';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';
import { NdjsonDecoder, NdjsonInvalidRecordError, NdjsonRecordTooLargeError } from '../protocol/Ndjson';
import { REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';
import {
  InvalidReporterHelloError,
  negotiateReporterHello,
  REPORTER_KNOWN_CAPABILITIES,
  type ReporterCapability,
  type IReporterChildContext,
  type IReporterHelloAck,
  type IReporterHandshakeResult
} from '../protocol/ReporterHandshake';

const REPORTER_EVENT_TYPE_SET: ReadonlySet<string> = new Set(REPORTER_EVENT_TYPES);

type IWireReporterEventEnvelope = Omit<IReporterEventEnvelope<unknown>, 'type'> & {
  readonly type: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isProtocolVersion(value: unknown): value is IReporterProtocolVersion {
  if (!isObjectRecord(value)) {
    return false;
  }
  return isNonNegativeInteger(value.major) && isNonNegativeInteger(value.minor);
}

function isReporterEventType(value: string): value is ReporterEventType {
  return REPORTER_EVENT_TYPE_SET.has(value);
}

function isReporterEventSource(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.packageName === 'string' &&
    typeof value.packageVersion === 'string' &&
    (value.component === undefined || typeof value.component === 'string')
  );
}

function isReporterEventScope(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }
  return ['commandName', 'operationId', 'projectName', 'phaseName'].every(
    (key: string) => value[key] === undefined || typeof value[key] === 'string'
  );
}

function isReporterEventRecord(value: unknown): value is IWireReporterEventEnvelope {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    isProtocolVersion(value.protocolVersion) &&
    typeof value.eventId === 'string' &&
    value.eventId.length > 0 &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    isNonNegativeInteger(value.sequence) &&
    typeof value.timestamp === 'string' &&
    isReporterEventSource(value.source) &&
    (value.scope === undefined || isReporterEventScope(value.scope)) &&
    (value.privacy === 'public' || value.privacy === 'local-sensitive' || value.privacy === 'secret') &&
    typeof value.required === 'boolean' &&
    typeof value.type === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'payload')
  );
}

/**
 * Options for constructing a {@link HeftDescriptorHost}.
 *
 * @beta
 */
export interface IHeftDescriptorHostOptions {
  /**
   * The parent session id used to correlate child events.
   */
  readonly parentSessionId: string;

  /**
   * The parent request id used to correlate child events.
   */
  readonly parentRequestId?: string;

  /**
   * The parent operation id used to correlate child events.
   */
  readonly parentOperationId?: string;

  /**
   * The protocol version the parent supports.
   */
  readonly supportedProtocolVersion: IReporterProtocolVersion;

  /**
   * The capabilities the parent supports.
   */
  readonly supportedCapabilities?: readonly ReporterCapability[];

  /**
   * Parent-owned rendering and filtering context offered to the child.
   */
  readonly context?: IReporterChildContext;

  /**
   * Forwards a correlated child envelope, typically to `ReporterManager.ingestForeignEnvelope`.
   */
  readonly forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => void;

  /**
   * Receives the handshake outcome, typically to emit the rejection diagnostic.
   * Called once when the first record is accepted or rejected.
   */
  readonly onNegotiation?: (result: IReporterHandshakeResult) => void;

  /**
   * Sends the acknowledgement to the child immediately after processing its hello.
   */
  readonly sendHelloAck?: (ack: IReporterHelloAck) => void;
}

/**
 * The result of consuming a child reporter stream.
 *
 * @beta
 */
export interface IHeftChildResult {
  /**
   * Whether the child's protocol was accepted.
   */
  readonly accepted: boolean;

  /**
   * The number of events forwarded.
   */
  readonly eventCount: number;

  /**
   * The acknowledgement produced while negotiating the stream.
   */
  readonly ack?: IReporterHelloAck;

  /**
   * A protocol diagnostic, when the child was rejected.
   */
  readonly diagnostic?: IRushDiagnostic;
}

/**
 * The parent side of the Heft reporter descriptor negotiation.
 *
 * @remarks
 * The host negotiates the child's hello, and, on acceptance, correlates each
 * child event with the parent session and operation ids before forwarding it.
 * When the child is rejected it surfaces a protocol diagnostic.
 *
 * Use {@link HeftDescriptorHost.createStreamProcessor} for a live child: it
 * drains the descriptor pipe as records arrive (so a chatty child never blocks
 * on a full OS pipe buffer) and forwards each event in receipt order. The
 * batch {@link HeftDescriptorHost.processChildNdjson} path is retained for
 * tests and completed streams.
 *
 * @beta
 */
export class HeftDescriptorHost {
  private readonly _parentSessionId: string;
  private readonly _parentRequestId: string | undefined;
  private readonly _parentOperationId: string | undefined;
  private readonly _supportedProtocolVersion: IReporterProtocolVersion;
  private readonly _supportedCapabilities: readonly ReporterCapability[];
  private readonly _reporterContext: IReporterChildContext | undefined;
  private readonly _forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => void;
  private readonly _onNegotiation: ((result: IReporterHandshakeResult) => void) | undefined;
  private readonly _sendHelloAck: ((ack: IReporterHelloAck) => void) | undefined;

  private _negotiation: IReporterHandshakeResult | undefined;
  private _protocolFailure: IRushDiagnostic | undefined;
  private _eventCount: number = 0;
  private _childSessionId: string | undefined;
  private _lastSourceSequence: number = -1;

  public constructor(options: IHeftDescriptorHostOptions) {
    this._parentSessionId = options.parentSessionId;
    this._parentRequestId = options.parentRequestId;
    this._parentOperationId = options.parentOperationId;
    this._supportedProtocolVersion = options.supportedProtocolVersion;
    this._supportedCapabilities = options.supportedCapabilities ?? REPORTER_KNOWN_CAPABILITIES;
    this._reporterContext = options.context;
    this._forwardEnvelope = options.forwardEnvelope;
    this._onNegotiation = options.onNegotiation;
    this._sendHelloAck = options.sendHelloAck;
  }

  /**
   * Processes a single decoded child record: the hello, then event envelopes.
   *
   * @remarks
   * On first call the record must be the hello; the negotiation outcome is
   * reported through {@link IHeftDescriptorHostOptions.onNegotiation} and, once
   * rejected, subsequent records are dropped. Returns `true` while the stream
   * is accepted.
   */
  public processChildRecord(record: unknown): boolean {
    if (this._protocolFailure !== undefined) {
      return false;
    }

    if (this._negotiation === undefined) {
      let result: IReporterHandshakeResult;
      try {
        result = negotiateReporterHello(record, {
          supportedProtocolVersion: this._supportedProtocolVersion,
          supportedCapabilities: this._supportedCapabilities,
          context: this._reporterContext
        });
      } catch (error) {
        if (error instanceof InvalidReporterHelloError) {
          return this._rejectMalformedStream('the first record was not a valid hello');
        }
        throw error;
      }
      this._setNegotiation(result);
      return result.accepted;
    }
    if (!this._negotiation.accepted) {
      return false;
    }

    if (!isReporterEventRecord(record)) {
      return this._rejectMalformedStream('an event record did not contain a valid reporter envelope');
    }
    if (!this._negotiation.ack.acceptedCapabilities.includes('heft-child-events-v1')) {
      return this._rejectMalformedStream(
        'an event record was received without negotiating "heft-child-events-v1"'
      );
    }
    if (record.protocolVersion.major !== this._negotiation.ack.protocolVersion.major) {
      return this._rejectMalformedStream(
        'an event record used a protocol major different from the negotiated stream'
      );
    }
    if (this._childSessionId !== undefined && record.sessionId !== this._childSessionId) {
      return this._rejectMalformedStream('the child session id changed within one reporter stream');
    }
    if (record.sequence <= this._lastSourceSequence) {
      return this._rejectMalformedStream('the child event sequence was not strictly increasing');
    }
    this._childSessionId ??= record.sessionId;
    this._lastSourceSequence = record.sequence;
    if (!isReporterEventType(record.type)) {
      if (record.required) {
        return this._rejectMalformedStream('a required event type was not recognized');
      }
      return true;
    }
    if (record.type === 'externalOutput') {
      if (
        !isObjectRecord(record.payload) ||
        (record.payload.stream !== 'stdout' && record.payload.stream !== 'stderr') ||
        typeof record.payload.text !== 'string'
      ) {
        return this._rejectMalformedStream('an external output event contained an invalid payload');
      }
      if (
        Buffer.byteLength(record.payload.text, 'utf8') > REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes
      ) {
        return this._rejectMalformedStream('an external output event exceeded the protocol chunk limit');
      }
    }

    const correlated: IReporterEventEnvelope<unknown> = {
      ...record,
      parentSessionId: this._parentSessionId,
      parentRequestId: this._parentRequestId,
      parentOperationId: this._parentOperationId,
      scope:
        this._parentOperationId !== undefined && record.scope?.operationId === undefined
          ? { ...record.scope, operationId: this._parentOperationId }
          : record.scope,
      required: isReporterEventRequired(record.type),
      type: record.type
    };
    this._forwardEnvelope(correlated);
    this._eventCount++;
    return true;
  }

  /**
   * Creates an incremental processor that decodes NDJSON chunks as they arrive
   * and forwards accepted events in receipt order.
   *
   * @remarks
   * This is the streaming drain: feed it each chunk read from the child's
   * descriptor pipe so the pipe is continuously drained and child progress
   * appears live. Call `flush()` when the pipe closes.
   */
  public createStreamProcessor(): { write(chunk: string): void; flush(): IHeftChildResult } {
    const decoder: NdjsonDecoder = new NdjsonDecoder();
    return {
      write: (chunk: string): void => {
        if (this._protocolFailure !== undefined || this._negotiation?.accepted === false) {
          return;
        }
        let records: unknown[];
        try {
          records = decoder.decode(chunk);
        } catch (error) {
          const decodedRecords: readonly unknown[] =
            error instanceof NdjsonInvalidRecordError || error instanceof NdjsonRecordTooLargeError
              ? error.decodedRecords
              : [];
          for (const record of decodedRecords) {
            if (!this.processChildRecord(record)) {
              break;
            }
          }
          this._rejectMalformedStream('its NDJSON could not be decoded within the protocol limits');
          return;
        }
        for (const record of records) {
          this.processChildRecord(record);
        }
      },
      flush: (): IHeftChildResult => {
        if (this._protocolFailure === undefined && this._negotiation?.accepted !== false) {
          let records: unknown[];
          try {
            records = decoder.flush();
          } catch (error) {
            const decodedRecords: readonly unknown[] =
              error instanceof NdjsonInvalidRecordError || error instanceof NdjsonRecordTooLargeError
                ? error.decodedRecords
                : [];
            for (const record of decodedRecords) {
              if (!this.processChildRecord(record)) {
                break;
              }
            }
            this._rejectMalformedStream('its trailing NDJSON record was invalid');
            return this._result();
          }
          for (const record of records) {
            this.processChildRecord(record);
          }
        }

        return this._result();
      }
    };
  }

  /**
   * Processes decoded child records: a hello followed by event envelopes.
   */
  public processChildRecords(records: readonly unknown[]): IHeftChildResult {
    for (const record of records) {
      this.processChildRecord(record);
    }
    return this._result();
  }

  /**
   * Decodes and processes a child's complete NDJSON stream.
   *
   * @remarks
   * Retained for tests and completed streams; live children should use
   * {@link HeftDescriptorHost.createStreamProcessor}.
   */
  public processChildNdjson(ndjson: string): IHeftChildResult {
    const processor: { write(chunk: string): void; flush(): IHeftChildResult } = this.createStreamProcessor();
    processor.write(ndjson);
    return processor.flush();
  }

  private _result(): IHeftChildResult {
    const negotiation: IReporterHandshakeResult | undefined = this._negotiation;
    if (negotiation === undefined) {
      return { accepted: false, eventCount: 0 };
    }
    return {
      accepted: negotiation.accepted && this._protocolFailure === undefined,
      eventCount: this._eventCount,
      ...('ack' in negotiation && negotiation.ack !== undefined ? { ack: negotiation.ack } : {}),
      ...(this._protocolFailure !== undefined
        ? { diagnostic: this._protocolFailure }
        : 'diagnostic' in negotiation && negotiation.diagnostic !== undefined
          ? { diagnostic: negotiation.diagnostic }
          : {})
    };
  }

  private _rejectMalformedStream(reason: string): false {
    if (this._protocolFailure === undefined) {
      this._protocolFailure = createRushDiagnostic('RUSH_PROTOCOL_INVALID_CHILD_STREAM', {
        parameters: {
          reason: { value: reason, privacy: 'public' }
        }
      });
    }

    if (this._negotiation === undefined) {
      const result: IReporterHandshakeResult = {
        accepted: false,
        ack: {
          kind: 'helloAck',
          protocolVersion: this._supportedProtocolVersion,
          acceptedCapabilities: [],
          rejectedRequiredFeatures: []
        },
        diagnostic: this._protocolFailure
      };
      this._setNegotiation(result);
    }
    return false;
  }

  private _setNegotiation(result: IReporterHandshakeResult): void {
    this._negotiation = result;
    this._sendHelloAck?.(result.ack);
    this._onNegotiation?.(result);
  }
}
