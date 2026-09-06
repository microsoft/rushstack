// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type {
  IReporterEventEnvelope,
  IReporterEventScope,
  IReporterEventSource
} from '../events/IReporterEventEnvelope';
import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';
import {
  REPORTER_EVENT_TYPES,
  isReporterEventRequired,
  type ReporterEventType
} from '../events/ReporterEventType';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';
import { isValidRushDiagnosticCode } from '../diagnostics/RushDiagnosticCode';
import { NdjsonDecoder, NdjsonInvalidRecordError, NdjsonRecordTooLargeError } from '../protocol/Ndjson';
import { REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';
import {
  InvalidReporterHelloError,
  negotiateReporterHello,
  REPORTER_KNOWN_CAPABILITIES,
  validateReporterChildContext,
  type ReporterCapability,
  type IReporterChildContext,
  type IReporterHelloAck,
  type IReporterHandshakeResult
} from '../protocol/ReporterHandshake';

const REPORTER_EVENT_TYPE_SET: ReadonlySet<string> = new Set(REPORTER_EVENT_TYPES);
const HEFT_CHILD_EVENT_TYPES: ReadonlySet<ReporterEventType> = new Set([
  'diagnosticEmitted',
  'externalOutput'
]);

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

function isDiagnosticRecord(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }
  if (
    typeof value.diagnosticId !== 'string' ||
    value.diagnosticId.length === 0 ||
    typeof value.code !== 'string' ||
    !isValidRushDiagnosticCode(value.code) ||
    typeof value.category !== 'string' ||
    value.category.length === 0 ||
    (value.severity !== 'warning' && value.severity !== 'error') ||
    typeof value.summaryKey !== 'string' ||
    value.summaryKey.length === 0 ||
    (value.detailKey !== undefined && typeof value.detailKey !== 'string') ||
    (value.retryable !== undefined && typeof value.retryable !== 'boolean')
  ) {
    return false;
  }
  if (value.parameters !== undefined) {
    if (!isObjectRecord(value.parameters)) {
      return false;
    }
    for (const parameter of Object.values(value.parameters)) {
      if (
        !isObjectRecord(parameter) ||
        !Object.prototype.hasOwnProperty.call(parameter, 'value') ||
        (parameter.privacy !== 'public' &&
          parameter.privacy !== 'local-sensitive' &&
          parameter.privacy !== 'secret')
      ) {
        return false;
      }
    }
  }
  for (const key of ['causeDiagnosticIds', 'relatedArtifactIds']) {
    const identifiers: unknown = value[key];
    if (
      identifiers !== undefined &&
      (!Array.isArray(identifiers) ||
        !identifiers.every((identifier: unknown) => typeof identifier === 'string'))
    ) {
      return false;
    }
  }
  if (value.remediation !== undefined) {
    if (!Array.isArray(value.remediation)) {
      return false;
    }
    for (const action of value.remediation) {
      if (
        !isObjectRecord(action) ||
        typeof action.descriptionKey !== 'string' ||
        action.descriptionKey.length === 0 ||
        (action.command !== undefined && typeof action.command !== 'string') ||
        (action.documentationUrl !== undefined && typeof action.documentationUrl !== 'string') ||
        (action.automatedExecutionSafety !== 'safe' &&
          action.automatedExecutionSafety !== 'requires-confirmation' &&
          action.automatedExecutionSafety !== 'unsafe')
      ) {
        return false;
      }
    }
  }
  if (value.source !== undefined) {
    if (!isObjectRecord(value.source)) {
      return false;
    }
    if (value.source.kind === 'file') {
      if (
        typeof value.source.file !== 'string' ||
        (value.source.line !== undefined && !isNonNegativeInteger(value.source.line)) ||
        (value.source.column !== undefined && !isNonNegativeInteger(value.source.column)) ||
        (value.source.toolName !== undefined && typeof value.source.toolName !== 'string')
      ) {
        return false;
      }
    } else if (value.source.kind === 'tool') {
      if (typeof value.source.toolName !== 'string') {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

function sanitizeDiagnosticRecord(
  value: Record<string, unknown>,
  envelopePrivacy: ReporterPrivacyClassification
): Record<string, unknown> {
  const parameters: Record<string, unknown> | undefined = isObjectRecord(value.parameters)
    ? Object.fromEntries(
        Object.entries(value.parameters).map(([name, parameter]: [string, unknown]) => {
          const classified: Record<string, unknown> = parameter as Record<string, unknown>;
          const redact: boolean = envelopePrivacy === 'secret' || classified.privacy === 'secret';
          return [
            name,
            {
              privacy: classified.privacy,
              value: redact ? '[secret]' : classified.value
            }
          ];
        })
      )
    : undefined;
  let source: Record<string, unknown> | undefined;
  if (envelopePrivacy !== 'secret' && isObjectRecord(value.source)) {
    source =
      value.source.kind === 'file'
        ? {
            kind: 'file',
            file: value.source.file,
            ...(value.source.line === undefined ? {} : { line: value.source.line }),
            ...(value.source.column === undefined ? {} : { column: value.source.column }),
            ...(value.source.toolName === undefined ? {} : { toolName: value.source.toolName })
          }
        : {
            kind: 'tool',
            toolName: value.source.toolName
          };
  }
  return {
    diagnosticId: value.diagnosticId,
    code: value.code,
    category: value.category,
    severity: value.severity,
    summaryKey: value.summaryKey,
    ...(value.detailKey === undefined ? {} : { detailKey: value.detailKey }),
    ...(parameters === undefined ? {} : { parameters }),
    ...(source === undefined ? {} : { source }),
    ...(value.causeDiagnosticIds === undefined
      ? {}
      : { causeDiagnosticIds: [...(value.causeDiagnosticIds as string[])] }),
    ...(value.retryable === undefined ? {} : { retryable: value.retryable }),
    ...(value.relatedArtifactIds === undefined
      ? {}
      : { relatedArtifactIds: [...(value.relatedArtifactIds as string[])] })
  };
}

function applyPrivacyFloor(
  privacy: ReporterPrivacyClassification,
  floor: ReporterPrivacyClassification | undefined
): ReporterPrivacyClassification {
  if (floor === undefined || privacy === 'secret' || privacy === floor) {
    return privacy;
  }
  if (floor === 'secret' || privacy === 'public') {
    return floor;
  }
  return privacy;
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
   * A parent-trusted source identity that replaces the child-provided source.
   */
  readonly trustedSource?: IReporterEventSource;

  /**
   * A parent-trusted privacy floor that prevents child events from claiming a less restrictive
   * classification.
   */
  readonly trustedPrivacy?: ReporterPrivacyClassification;

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
  private readonly _trustedSource: IReporterEventSource | undefined;
  private readonly _trustedPrivacy: ReporterPrivacyClassification | undefined;
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
    this._reporterContext =
      options.context === undefined ? undefined : validateReporterChildContext(options.context);
    this._trustedSource = options.trustedSource;
    this._trustedPrivacy = options.trustedPrivacy;
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
    if (!HEFT_CHILD_EVENT_TYPES.has(record.type)) {
      if (isReporterEventRequired(record.type)) {
        return this._rejectMalformedStream('a required event type is not permitted from a Heft child');
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
    } else if (record.type === 'diagnosticEmitted' && !isDiagnosticRecord(record.payload)) {
      return this._rejectMalformedStream('a diagnostic event contained an invalid payload');
    }

    const privacy: ReporterPrivacyClassification = applyPrivacyFloor(record.privacy, this._trustedPrivacy);
    const payload: unknown =
      record.type === 'externalOutput'
        ? {
            stream: (record.payload as Record<string, unknown>).stream,
            text:
              privacy === 'secret'
                ? '[secret child output omitted]'
                : (record.payload as Record<string, unknown>).text
          }
        : record.type === 'diagnosticEmitted'
          ? sanitizeDiagnosticRecord(record.payload as Record<string, unknown>, privacy)
          : record.payload;
    const source: IReporterEventSource = this._trustedSource
      ? { ...this._trustedSource }
      : {
          packageName: record.source.packageName,
          packageVersion: record.source.packageVersion,
          ...(record.source.component === undefined ? {} : { component: record.source.component })
        };
    const scope: IReporterEventScope | undefined =
      record.scope === undefined && this._parentOperationId === undefined
        ? undefined
        : {
            ...(record.scope?.commandName === undefined ? {} : { commandName: record.scope.commandName }),
            ...(record.scope?.projectName === undefined ? {} : { projectName: record.scope.projectName }),
            ...(record.scope?.phaseName === undefined ? {} : { phaseName: record.scope.phaseName }),
            ...(this._parentOperationId !== undefined
              ? { operationId: this._parentOperationId }
              : record.scope?.operationId === undefined
                ? {}
                : { operationId: record.scope.operationId })
          };
    const correlated: IReporterEventEnvelope<unknown> = {
      protocolVersion: {
        major: record.protocolVersion.major,
        minor: record.protocolVersion.minor
      },
      eventId: record.eventId,
      sessionId: record.sessionId,
      parentSessionId: this._parentSessionId,
      parentRequestId: this._parentRequestId,
      parentOperationId: this._parentOperationId,
      sequence: record.sequence,
      timestamp: record.timestamp,
      source,
      scope,
      privacy,
      required: isReporterEventRequired(record.type),
      type: record.type,
      payload
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
