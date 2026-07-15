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
 * @beta
 */
export class HeftDescriptorHost {
  private readonly _parentSessionId: string;
  private readonly _parentOperationId: string | undefined;
  private readonly _supportedProtocolVersion: IReporterProtocolVersion;
  private readonly _supportedCapabilities: readonly string[] | undefined;
  private readonly _forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => void;

  public constructor(options: IHeftDescriptorHostOptions) {
    this._parentSessionId = options.parentSessionId;
    this._parentOperationId = options.parentOperationId;
    this._supportedProtocolVersion = options.supportedProtocolVersion;
    this._supportedCapabilities = options.supportedCapabilities;
    this._forwardEnvelope = options.forwardEnvelope;
  }

  /**
   * Processes decoded child records: a hello followed by event envelopes.
   */
  public processChildRecords(records: readonly unknown[]): IHeftChildResult {
    if (records.length === 0 || (records[0] as { kind?: string }).kind !== 'hello') {
      return { accepted: false, eventCount: 0 };
    }

    const negotiation: IReporterHandshakeResult = negotiateReporterHello(records[0] as IReporterHello, {
      supportedProtocolVersion: this._supportedProtocolVersion,
      supportedCapabilities: this._supportedCapabilities
    });
    if (!negotiation.accepted) {
      return {
        accepted: false,
        eventCount: 0,
        ack: negotiation.ack,
        diagnostic: negotiation.diagnostic
      };
    }

    let eventCount: number = 0;
    for (let index: number = 1; index < records.length; index++) {
      const childEnvelope: IReporterEventEnvelope<unknown> = records[
        index
      ] as IReporterEventEnvelope<unknown>;
      const correlated: IReporterEventEnvelope<unknown> = {
        ...childEnvelope,
        parentSessionId: this._parentSessionId,
        parentOperationId: this._parentOperationId
      };
      this._forwardEnvelope(correlated);
      eventCount++;
    }

    return { accepted: true, eventCount, ack: negotiation.ack };
  }

  /**
   * Decodes and processes a child's NDJSON stream.
   */
  public processChildNdjson(ndjson: string): IHeftChildResult {
    const decoder: NdjsonDecoder = new NdjsonDecoder();
    const records: unknown[] = [...decoder.decode(ndjson), ...decoder.flush()];
    return this.processChildRecords(records);
  }
}
