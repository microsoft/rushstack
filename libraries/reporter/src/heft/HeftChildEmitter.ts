// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import { isReporterEventRequired, type ReporterEventType } from '../events/ReporterEventType';
import { encodeNdjsonRecord } from '../protocol/Ndjson';
import {
  isReporterProtocolCompatible,
  REPORTER_PROTOCOL_LIMITS,
  REPORTER_PROTOCOL_VERSION
} from '../protocol/ReporterProtocol';
import {
  parseReporterHelloAck,
  REPORTER_KNOWN_CAPABILITIES,
  type IReporterChildContext,
  type IReporterHello,
  type IReporterHelloAck
} from '../protocol/ReporterHandshake';
import { chunkUtf8Text } from '../utilities/chunkUtf8Text';
import {
  readChildAckDescriptorFd,
  readChildDescriptorFd,
  RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR,
  RUSH_REPORTER_CHILD_FD_ENV_VAR
} from './HeftDescriptor';

/**
 * The mode a Heft child reporter operates in.
 *
 * @beta
 */
export type HeftChildReporterMode = 'negotiation-pending' | 'structured' | 'raw-fallback';

/**
 * An event a Heft child emits.
 *
 * @beta
 */
export interface IHeftChildEventInput {
  readonly type: ReporterEventType;
  readonly privacy?: 'public' | 'local-sensitive' | 'secret';
  readonly scope?: IReporterEventScope;
  readonly payload?: unknown;
}

/**
 * Options for {@link HeftChildEmitter}.
 *
 * @beta
 */
export interface IHeftChildEmitterOptions {
  /**
   * The environment variables, consulted for the inherited descriptor. The
   * descriptor variable is removed when the emitter is constructed so it is
   * not inherited by descendants that do not inherit the descriptor itself.
   */
  readonly env: Record<string, string | undefined>;

  /**
   * The child session id stamped onto emitted events.
   */
  readonly childSessionId: string;

  /**
   * The producer identity stamped onto emitted events.
   */
  readonly source: IReporterEventSource;

  /**
   * The producer version advertised in the hello.
   */
  readonly producerVersion: string;

  /**
   * The protocol version. Defaults to {@link REPORTER_PROTOCOL_VERSION}.
   */
  readonly protocolVersion?: IReporterProtocolVersion;

  /**
   * The capabilities advertised in the hello.
   */
  readonly capabilities?: readonly string[];

  /**
   * The required features advertised in the hello.
   */
  readonly requiredFeatures?: readonly string[];

  /**
   * Writes NDJSON to the inherited descriptor. Required for structured mode.
   */
  readonly writeDescriptor?: (text: string) => void;

  /**
   * Writes raw text to stdout, used in fallback mode.
   */
  readonly writeStdout?: (text: string) => void;

  /**
   * Writes raw text to stderr, used in fallback mode.
   */
  readonly writeStderr?: (text: string) => void;

  /**
   * Returns the current timestamp. Injectable for testing.
   */
  readonly now?: () => string;
}

/**
 * The child side of the Heft reporter descriptor negotiation.
 *
 * @remarks
 * When the inherited descriptor is present, the child emits structured NDJSON
 * events over it, stamping its child session id. When the descriptor is
 * unavailable, it falls back to normal stdout and stderr, which Rush preserves
 * and runs through problem matchers.
 *
 * @beta
 */
export class HeftChildEmitter {
  /**
   * Whether the child is negotiating, emitting structured events, or using raw streams.
   */
  public get mode(): HeftChildReporterMode {
    return this._mode;
  }

  /**
   * Parent-owned rendering and filtering context accepted during negotiation.
   */
  public get context(): IReporterChildContext | undefined {
    return this._context;
  }

  private readonly _writeDescriptor: ((text: string) => void) | undefined;
  private readonly _writeStdout: ((text: string) => void) | undefined;
  private readonly _writeStderr: ((text: string) => void) | undefined;
  private readonly _childSessionId: string;
  private readonly _source: IReporterEventSource;
  private readonly _producerVersion: string;
  private readonly _protocolVersion: IReporterProtocolVersion;
  private readonly _capabilities: readonly string[];
  private readonly _requiredFeatures: readonly string[];
  private readonly _now: () => string;
  private _mode: HeftChildReporterMode;
  private _context: IReporterChildContext | undefined;
  private _helloSent: boolean;
  private _sequence: number;
  private _nextEventId: number;

  public constructor(options: IHeftChildEmitterOptions) {
    const fd: number | undefined = readChildDescriptorFd(options.env);
    const ackFd: number | undefined = readChildAckDescriptorFd(options.env);
    delete options.env[RUSH_REPORTER_CHILD_FD_ENV_VAR];
    delete options.env[RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR];
    this._mode =
      fd !== undefined && ackFd !== undefined && fd !== ackFd && options.writeDescriptor !== undefined
        ? 'negotiation-pending'
        : 'raw-fallback';

    this._writeDescriptor = options.writeDescriptor;
    this._writeStdout = options.writeStdout;
    this._writeStderr = options.writeStderr;
    this._childSessionId = options.childSessionId;
    this._source = options.source;
    this._producerVersion = options.producerVersion;
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this._capabilities = [...(options.capabilities ?? REPORTER_KNOWN_CAPABILITIES)];
    this._requiredFeatures = [...(options.requiredFeatures ?? [])];
    this._now = options.now ?? (() => new Date().toISOString());
    this._helloSent = false;
    this._sequence = 1;
    this._nextEventId = 1;
  }

  /**
   * Sends the hello handshake over the descriptor.
   *
   * @remarks
   * Structured events remain disabled until {@link HeftChildEmitter.acceptHelloAck}
   * accepts a compatible acknowledgement containing `heft-child-events-v1`.
   * Returns `false` in fallback mode or after the hello was already sent.
   */
  public sendHello(): boolean {
    if (this._mode !== 'negotiation-pending' || this._writeDescriptor === undefined || this._helloSent) {
      return false;
    }
    const hello: IReporterHello = {
      kind: 'hello',
      protocolVersion: this._protocolVersion,
      producerVersion: this._producerVersion,
      capabilities: [...this._capabilities],
      requiredFeatures: [...this._requiredFeatures]
    };
    try {
      this._writeDescriptor(encodeNdjsonRecord(hello));
      this._helloSent = true;
      return true;
    } catch {
      this._switchToRawFallback();
      return false;
    }
  }

  /**
   * Accepts a decoded hello acknowledgement from the parent.
   *
   * @remarks
   * Unsupported, rejected, malformed, or missing acknowledgements fail closed
   * to raw output. This method never throws for untrusted acknowledgement data.
   */
  public acceptHelloAck(value: unknown): boolean {
    if (this._mode !== 'negotiation-pending' || !this._helloSent) {
      return false;
    }

    let ack: IReporterHelloAck;
    try {
      ack = parseReporterHelloAck(value);
    } catch {
      this._switchToRawFallback();
      return false;
    }

    const advertisedCapabilities: ReadonlySet<string> = new Set(this._capabilities);
    const acceptedCapabilitiesAreValid: boolean = ack.acceptedCapabilities.every((capability: string) =>
      advertisedCapabilities.has(capability)
    );
    if (
      !isReporterProtocolCompatible(this._protocolVersion, ack.protocolVersion) ||
      ack.rejectedRequiredFeatures.length > 0 ||
      !acceptedCapabilitiesAreValid ||
      !ack.acceptedCapabilities.includes('heft-child-events-v1')
    ) {
      this._switchToRawFallback();
      return false;
    }

    this._context = ack.context === undefined ? undefined : Object.freeze({ ...ack.context });
    this._mode = 'structured';
    return true;
  }

  /**
   * Reports that the acknowledgement descriptor closed without an accepted acknowledgement.
   */
  public handleAckDescriptorClose(): void {
    if (this._mode === 'negotiation-pending') {
      this._switchToRawFallback();
    }
  }

  /**
   * Emits a structured event over the descriptor. Returns the event id, or
   * `undefined` in fallback mode.
   */
  public emitEvent(input: IHeftChildEventInput): string | undefined {
    if (this._mode !== 'structured' || this._writeDescriptor === undefined) {
      return undefined;
    }
    const eventId: string = `child_${this._nextEventId++}`;
    const envelope: Record<string, unknown> = {
      protocolVersion: this._protocolVersion,
      eventId,
      sessionId: this._childSessionId,
      sequence: this._sequence++,
      timestamp: this._now(),
      source: this._source,
      scope: input.scope,
      privacy: input.privacy ?? 'public',
      required: isReporterEventRequired(input.type),
      type: input.type,
      payload: input.payload ?? {}
    };
    this._writeDescriptor(encodeNdjsonRecord(envelope));
    return eventId;
  }

  /**
   * Emits raw output as bounded structured events, or writes it to the raw fallback stream.
   *
   * @returns the structured event ids, or an empty array in raw fallback mode
   */
  public emitOutput(
    stream: 'stdout' | 'stderr',
    text: string,
    scope?: IReporterEventScope
  ): readonly string[] {
    if (this._mode !== 'structured') {
      this.writeRaw(stream, text);
      return [];
    }

    const eventIds: string[] = [];
    for (const chunk of chunkUtf8Text(text, REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes)) {
      const eventId: string | undefined = this.emitEvent({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        scope,
        payload: { stream, text: chunk }
      });
      if (eventId !== undefined) {
        eventIds.push(eventId);
      }
    }
    return eventIds;
  }

  /**
   * Writes raw output to stdout or stderr, preserved for problem matchers.
   */
  public writeRaw(stream: 'stdout' | 'stderr', text: string): void {
    if (stream === 'stderr') {
      this._writeStderr?.(text);
    } else {
      this._writeStdout?.(text);
    }
  }

  private _switchToRawFallback(): void {
    this._mode = 'raw-fallback';
    this._context = undefined;
  }
}
