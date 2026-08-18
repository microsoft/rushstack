// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The wire layer every rushd client speaks: the frame taxonomy and
 * length-prefixed binary codec, the event envelope contract, and the
 * connection handshake with version negotiation.
 *
 * @remarks
 * Engine-agnostic, platform-agnostic (`Uint8Array` payloads, never `Buffer`),
 * zero runtime dependencies, and no `rush-lib` dependency. The event contract
 * mirrors `@rushstack/reporter`'s envelope as a placeholder until it merges.
 * @packageDocumentation
 */

export type { IDaemonFrame } from './DaemonFrame';
export { DaemonFrameType, isDaemonFrameType } from './DaemonFrameType';
export {
  DEFAULT_MAX_PAYLOAD_BYTES, FRAME_HEADER_BYTES, LENGTH_FIELD_BYTES, LENGTH_FIELD_OFFSET,
  MAX_OPERATION_ID_BYTES, OPERATION_ID_LENGTH_BYTES, OPERATION_ID_LENGTH_OFFSET, PAYLOAD_OFFSET,
  TYPE_FIELD_BYTES, TYPE_FIELD_OFFSET
} from './FrameConstants';
export { encodeDaemonFrame, encodeDaemonFrames } from './FrameEncoder';
export { DaemonFrameDecoder, type IDaemonFrameDecoderOptions } from './FrameDecoder';
export { DaemonProtocolError, ProtocolVersionMismatchError } from './DaemonProtocolError';
export type { DaemonProtocolErrorCode, IDaemonProtocolErrorOptions } from './DaemonProtocolError';
export { DAEMON_PROTOCOL_VERSION, isDaemonProtocolCompatible } from './DaemonProtocolVersion';
export type { IDaemonProtocolVersion } from './DaemonProtocolVersion';
export type { IDaemonClientCaps } from './DaemonClientCaps';
export { DAEMON_CONTROL_MESSAGE_KINDS, isDaemonControlMessageKind } from './DaemonControlMessage';
export type { DaemonControlMessage, DaemonControlMessageKind, DaemonEmptyPayload } from './DaemonControlMessage';
export type { IDaemonErrorMessage, IDaemonHelloAckMessage, IDaemonHelloMessage } from './DaemonControlMessage';
export type { IDaemonPingMessage, IDaemonPongMessage, IDaemonSubscribeMessage, IDaemonUnsubscribeMessage } from './DaemonControlMessage';
export { isDaemonControlRecord, validateDaemonControlMessage } from './ControlMessageValidation';
export { decodeDaemonControlMessage, encodeDaemonControlMessage } from './ControlFrameCodec';
export { decodeDaemonLogChunk, encodeDaemonLogChunk, type IDaemonLogChunk } from './LogFrameCodec';
export { createDaemonHello, createDaemonHelloAck, negotiateDaemonHello } from './DaemonHandshake';
export type { DaemonHandshakeOutcome } from './DaemonHandshake';
export type { DaemonJsonNull, DaemonJsonValue } from './DaemonJsonValue';
export { DAEMON_EVENT_TYPES, isDaemonEventType, type DaemonEventType } from './DaemonEventType';
export type { DaemonEventPrivacy, IDaemonEventEnvelope, IDaemonEventScope, IDaemonEventSource } from './DaemonEventEnvelope';
export { isDaemonEventEnvelope, validateDaemonEventEnvelope } from './DaemonEventValidation';
export { isDaemonExtensionEventName, isRushdExtensionEventName, RUSHD_EXTENSION_NAMESPACE } from './DaemonExtensionEventName';
export type { DaemonExtensionEventName } from './DaemonExtensionEventName';
export { compareDaemonVerbosity, isDaemonVerbosity, type DaemonVerbosity } from './DaemonVerbosity';
export { shouldSerializeDaemonEvent } from './DaemonVerbosityFilter';
export type { DaemonDiagnosticSeverity, IDaemonDiagnosticPayload } from './DaemonVerbosityFilter';
export { decodeDaemonEventFrame, encodeDaemonEventFrame, serializeDaemonEventForSubscription } from './DaemonEventFrameCodec';
export type { IDaemonActivityPayload, IDaemonOperationRegisteredPayload, IDaemonOperationStatusChangedPayload } from './DaemonOperationPayloads';
export { RUSHD_OPERATION_HEADER, RUSHD_OPERATION_STREAM_CLOSED } from './DaemonRushdExtensions';
export type { IDaemonExtensionEventPayload, IDaemonOperationHeaderPayload, IDaemonOperationStreamClosedPayload } from './DaemonRushdExtensions';
