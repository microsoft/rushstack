// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The wire layer every rushd client speaks: the frame taxonomy and
 * length-prefixed binary codec, the event envelope contract, and the
 * connection handshake with version negotiation.
 *
 * @remarks
 * This package is engine-agnostic and has no `rush-lib` dependency. The event
 * contract currently mirrors `@rushstack/reporter`'s envelope as a placeholder
 * and will reference it directly once the reporter package merges into main.
 *
 * @packageDocumentation
 */

export type { IDaemonFrame } from './DaemonFrame';
export { DaemonFrameType, isDaemonFrameType } from './DaemonFrameType';
export {
  DEFAULT_MAX_PAYLOAD_BYTES,
  FRAME_HEADER_BYTES,
  LENGTH_FIELD_BYTES,
  LENGTH_FIELD_OFFSET,
  MAX_OPERATION_ID_BYTES,
  OPERATION_ID_LENGTH_BYTES,
  OPERATION_ID_LENGTH_OFFSET,
  PAYLOAD_OFFSET,
  TYPE_FIELD_BYTES,
  TYPE_FIELD_OFFSET
} from './FrameConstants';
export { encodeDaemonFrame, encodeDaemonFrames } from './FrameEncoder';
export { DaemonFrameDecoder, type IDaemonFrameDecoderOptions } from './FrameDecoder';
export {
  DaemonProtocolError,
  DaemonProtocolErrorCode,
  ProtocolVersionMismatchError
} from './DaemonProtocolError';
export {
  DAEMON_PROTOCOL_VERSION,
  isDaemonProtocolCompatible,
  type IDaemonProtocolVersion
} from './DaemonProtocolVersion';
export {
  DAEMON_CONTROL_MESSAGE_KINDS,
  type DaemonControlMessage,
  type IDaemonClientCaps,
  type IDaemonHelloAckMessage,
  type IDaemonHelloMessage,
  type IDaemonSubscribeMessage
} from './DaemonControlMessage';
export { validateDaemonControlMessage } from './ControlMessageValidation';
export { decodeDaemonControlMessage, encodeDaemonControlMessage } from './ControlFrameCodec';
export { decodeDaemonLogChunk, encodeDaemonLogChunk, type IDaemonLogChunk } from './LogFrameCodec';
export {
  createDaemonHello,
  createDaemonHelloAck,
  negotiateDaemonHello,
  type DaemonHandshakeOutcome
} from './DaemonHandshake';
export type { DaemonJsonNull, DaemonJsonValue } from './DaemonJsonValue';
export {
  DAEMON_EVENT_TYPES,
  isDaemonEventType,
  type DaemonEventType
} from './DaemonEventType';
export type {
  DaemonEventPrivacy,
  IDaemonEventEnvelope,
  IDaemonEventScope,
  IDaemonEventSource
} from './DaemonEventEnvelope';
export {
  isDaemonExtensionEventName,
  isRushdExtensionEventName,
  RUSHD_EXTENSION_NAMESPACE,
  type DaemonExtensionEventName
} from './DaemonExtensionEventName';
export { compareDaemonVerbosity, isDaemonVerbosity, type DaemonVerbosity } from './DaemonVerbosity';
export {
  shouldSerializeDaemonEvent,
  type DaemonDiagnosticSeverity,
  type IDaemonDiagnosticPayload
} from './DaemonVerbosityFilter';
export {
  decodeDaemonEventFrame,
  encodeDaemonEventFrame,
  serializeDaemonEventForSubscription
} from './DaemonEventFrameCodec';
export type {
  IDaemonActivityPayload,
  IDaemonOperationRegisteredPayload,
  IDaemonOperationStatusChangedPayload
} from './DaemonOperationPayloads';
export {
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED,
  type IDaemonExtensionEventPayload,
  type IDaemonOperationHeaderPayload,
  type IDaemonOperationStreamClosedPayload
} from './DaemonRushdExtensions';
