// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import { encodeNdjsonRecord } from '../protocol/Ndjson';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';
import type { IReporterHello } from '../protocol/ReporterHandshake';
import { readChildDescriptorFd } from './HeftDescriptor';

/**
 * The mode a Heft child reporter operates in.
 *
 * @beta
 */
export type HeftChildReporterMode = 'structured' | 'raw-fallback';

/**
 * An event a Heft child emits.
 *
 * @beta
 */
export interface IHeftChildEventInput {
  readonly type: string;
  readonly required: boolean;
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
   * The environment variables, consulted for the inherited descriptor.
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
   * Whether the child emits structured events or falls back to raw streams.
   */
  public readonly mode: HeftChildReporterMode;

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
  private _sequence: number;
  private _nextEventId: number;

  public constructor(options: IHeftChildEmitterOptions) {
    const fd: number | undefined = readChildDescriptorFd(options.env);
    this.mode = fd !== undefined && options.writeDescriptor !== undefined ? 'structured' : 'raw-fallback';

    this._writeDescriptor = options.writeDescriptor;
    this._writeStdout = options.writeStdout;
    this._writeStderr = options.writeStderr;
    this._childSessionId = options.childSessionId;
    this._source = options.source;
    this._producerVersion = options.producerVersion;
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this._capabilities = options.capabilities ?? [];
    this._requiredFeatures = options.requiredFeatures ?? [];
    this._now = options.now ?? (() => new Date().toISOString());
    this._sequence = 1;
    this._nextEventId = 1;
  }

  /**
   * Sends the hello handshake over the descriptor. Returns `false` in fallback mode.
   */
  public sendHello(): boolean {
    if (this.mode !== 'structured' || this._writeDescriptor === undefined) {
      return false;
    }
    const hello: IReporterHello = {
      kind: 'hello',
      protocolVersion: this._protocolVersion,
      producerVersion: this._producerVersion,
      capabilities: [...this._capabilities],
      requiredFeatures: [...this._requiredFeatures]
    };
    this._writeDescriptor(encodeNdjsonRecord(hello));
    return true;
  }

  /**
   * Emits a structured event over the descriptor. Returns the event id, or
   * `undefined` in fallback mode.
   */
  public emitEvent(input: IHeftChildEventInput): string | undefined {
    if (this.mode !== 'structured' || this._writeDescriptor === undefined) {
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
      required: input.required,
      type: input.type,
      payload: input.payload ?? {}
    };
    this._writeDescriptor(encodeNdjsonRecord(envelope));
    return eventId;
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
}
