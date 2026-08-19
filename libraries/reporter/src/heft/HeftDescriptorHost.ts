// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { NdjsonDecoder } from '../protocol/Ndjson';
import {
  negotiateReporterHello,
  type IReporterHello,
  type IReporterHelloAck,
  type IReporterHandshakeResult
} from '../protocol/ReporterHandshake';

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
  readonly supportedCapabilities?: readonly string[];

  /**
   * Forwards a correlated child envelope, typically to `ReporterManager.ingestForeignEnvelope`.
   */
  readonly forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => void;

  /**
   * Receives the handshake outcome, typically to emit the rejection diagnostic.
   * Called once, when the hello is negotiated.
   */
  readonly onNegotiation?: (result: IReporterHandshakeResult) => void;
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
   * The acknowledgement, when a hello was received.
   */
  readonly ack?: IReporterHelloAck;

  /**
   * An update-global-Rush diagnostic, when the child was rejected.
   */
  readonly diagnostic?: IRushDiagnostic;
}

/**
 * The parent side of the Heft reporter descriptor negotiation.
 *
 * @remarks
 * The host negotiates the child's hello, and, on acceptance, correlates each
 * child event with the parent session and operation ids before forwarding it.
 * When the child is rejected it surfaces an update-global-Rush diagnostic.
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
  private readonly _parentOperationId: string | undefined;
  private readonly _supportedProtocolVersion: IReporterProtocolVersion;
  private readonly _supportedCapabilities: readonly string[] | undefined;
  private readonly _forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => void;
  private readonly _onNegotiation: ((result: IReporterHandshakeResult) => void) | undefined;

  private _negotiation: IReporterHandshakeResult | { accepted: false } | undefined;
  private _eventCount: number = 0;

  public constructor(options: IHeftDescriptorHostOptions) {
    this._parentSessionId = options.parentSessionId;
    this._parentOperationId = options.parentOperationId;
    this._supportedProtocolVersion = options.supportedProtocolVersion;
    this._supportedCapabilities = options.supportedCapabilities;
    this._forwardEnvelope = options.forwardEnvelope;
    this._onNegotiation = options.onNegotiation;
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
    if (this._negotiation === undefined) {
      const hello: IReporterHello = record as IReporterHello;
      if ((record as { kind?: string }).kind !== 'hello') {
        this._negotiation = { accepted: false };
        return false;
      }
      const result: IReporterHandshakeResult = negotiateReporterHello(hello, {
        supportedProtocolVersion: this._supportedProtocolVersion,
        supportedCapabilities: this._supportedCapabilities
      });
      this._negotiation = result;
      this._onNegotiation?.(result);
      return result.accepted;
    }
    if (!this._negotiation.accepted) {
      return false;
    }
    const childEnvelope: IReporterEventEnvelope<unknown> = record as IReporterEventEnvelope<unknown>;
    const correlated: IReporterEventEnvelope<unknown> = {
      ...childEnvelope,
      parentSessionId: this._parentSessionId,
      parentOperationId: this._parentOperationId
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
        for (const record of decoder.decode(chunk)) {
          this.processChildRecord(record);
        }
      },
      flush: (): IHeftChildResult => {
        for (const record of decoder.flush()) {
          this.processChildRecord(record);
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
    const decoder: NdjsonDecoder = new NdjsonDecoder();
    for (const record of [...decoder.decode(ndjson), ...decoder.flush()]) {
      this.processChildRecord(record);
    }
    return this._result();
  }

  private _result(): IHeftChildResult {
    const negotiation: IReporterHandshakeResult | { accepted: false } | undefined = this._negotiation;
    if (negotiation === undefined) {
      return { accepted: false, eventCount: 0 };
    }
    return {
      accepted: negotiation.accepted,
      eventCount: this._eventCount,
      ...('ack' in negotiation && negotiation.ack !== undefined ? { ack: negotiation.ack } : {}),
      ...('diagnostic' in negotiation && negotiation.diagnostic !== undefined
        ? { diagnostic: negotiation.diagnostic }
        : {})
    };
  }
}