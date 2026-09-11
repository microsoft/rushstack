// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import { isReporterEventRequired, type ReporterEventType } from '../events/ReporterEventType';
import { encodeNdjsonRecord } from '../protocol/Ndjson';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';
import type { IReporterHello } from '../protocol/ReporterHandshake';
import { readChildDescriptorFd, RUSH_REPORTER_CHILD_FD_ENV_VAR } from './HeftDescriptor';

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
   * Whether the child emits structured events or falls back to raw streams.
   */
  public readonly mode: HeftChildReporterMode;

  readonly #writeDescriptor: ((text: string) => void) | undefined;
  readonly #writeStdout: ((text: string) => void) | undefined;
  readonly #writeStderr: ((text: string) => void) | undefined;
  readonly #childSessionId: string;
  readonly #source: IReporterEventSource;
  readonly #producerVersion: string;
  readonly #protocolVersion: IReporterProtocolVersion;
  readonly #capabilities: readonly string[];
  readonly #requiredFeatures: readonly string[];
  readonly #now: () => string;
  #sequence: number;
  #nextEventId: number;

  public constructor(options: IHeftChildEmitterOptions) {
    const fd: number | undefined = readChildDescriptorFd(options.env);
    delete options.env[RUSH_REPORTER_CHILD_FD_ENV_VAR];
    this.mode = fd !== undefined && options.writeDescriptor !== undefined ? 'structured' : 'raw-fallback';

    this.#writeDescriptor = options.writeDescriptor;
    this.#writeStdout = options.writeStdout;
    this.#writeStderr = options.writeStderr;
    this.#childSessionId = options.childSessionId;
    this.#source = options.source;
    this.#producerVersion = options.producerVersion;
    this.#protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this.#capabilities = options.capabilities ?? [];
    this.#requiredFeatures = options.requiredFeatures ?? [];
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#sequence = 1;
    this.#nextEventId = 1;
  }

  /**
   * Sends the hello handshake over the descriptor. Returns `false` in fallback mode.
   */
  public sendHello(): boolean {
    if (this.mode !== 'structured' || this.#writeDescriptor === undefined) {
      return false;
    }
    const hello: IReporterHello = {
      kind: 'hello',
      protocolVersion: this.#protocolVersion,
      producerVersion: this.#producerVersion,
      capabilities: [...this.#capabilities],
      requiredFeatures: [...this.#requiredFeatures]
    };
    this.#writeDescriptor(encodeNdjsonRecord(hello));
    return true;
  }

  /**
   * Emits a structured event over the descriptor. Returns the event id, or
   * `undefined` in fallback mode.
   */
  public emitEvent(input: IHeftChildEventInput): string | undefined {
    if (this.mode !== 'structured' || this.#writeDescriptor === undefined) {
      return undefined;
    }
    const eventId: string = `child_${this.#nextEventId++}`;
    const envelope: Record<string, unknown> = {
      protocolVersion: this.#protocolVersion,
      eventId,
      sessionId: this.#childSessionId,
      sequence: this.#sequence++,
      timestamp: this.#now(),
      source: this.#source,
      scope: input.scope,
      privacy: input.privacy ?? 'public',
      required: isReporterEventRequired(input.type),
      type: input.type,
      payload: input.payload ?? {}
    };
    this.#writeDescriptor(encodeNdjsonRecord(envelope));
    return eventId;
  }

  /**
   * Writes raw output to stdout or stderr, preserved for problem matchers.
   */
  public writeRaw(stream: 'stdout' | 'stderr', text: string): void {
    if (stream === 'stderr') {
      this.#writeStderr?.(text);
    } else {
      this.#writeStdout?.(text);
    }
  }
}
