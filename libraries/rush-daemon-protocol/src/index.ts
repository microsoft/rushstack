// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The wire layer every rushd client speaks: the frame taxonomy and length-prefixed binary codec, the event envelope contract, and the
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
export { DEFAULT_MAX_PAYLOAD_BYTES, FRAME_HEADER_BYTES, LENGTH_FIELD_BYTES } from './FrameConstants';
export { LENGTH_FIELD_OFFSET, MAX_OPERATION_ID_BYTES, MAX_REQUEST_ID_BYTES } from './FrameConstants';
export { OPERATION_ID_LENGTH_BYTES, OPERATION_ID_LENGTH_OFFSET, PAYLOAD_OFFSET } from './FrameConstants';
export { REQUEST_ID_LENGTH_BYTES, REQUEST_ID_LENGTH_OFFSET, TYPE_FIELD_BYTES } from './FrameConstants';
export { TYPE_FIELD_OFFSET } from './FrameConstants';
export { encodeDaemonFrame, encodeDaemonFrames } from './FrameEncoder';
export { DaemonFrameDecoder, type IDaemonFrameDecoderOptions } from './FrameDecoder';
export { DaemonProtocolError, ProtocolVersionMismatchError } from './DaemonProtocolError';
export type { DaemonProtocolErrorCode, IDaemonProtocolErrorOptions } from './DaemonProtocolError';
export { DAEMON_GRAPH_GENERATION_PROTOCOL_MINOR } from './DaemonProtocolVersion';
export { DAEMON_INPUT_LIFECYCLE_PROTOCOL_MINOR } from './DaemonProtocolVersion';
export { DAEMON_INTERACTIVE_IO_PROTOCOL_MINOR } from './DaemonProtocolVersion';
export { DAEMON_INVOCATION_KIND_PROTOCOL_MINOR } from './DaemonProtocolVersion';
export { DAEMON_LIFECYCLE_PROTOCOL_MINOR } from './DaemonProtocolVersion';
export { DAEMON_REQUEST_ADMISSION_PROTOCOL_MINOR } from './DaemonProtocolVersion';
export { DAEMON_REQUEST_LIFECYCLE_PROTOCOL_MINOR, DAEMON_PROTOCOL_VERSION } from './DaemonProtocolVersion';
export { isDaemonProtocolCompatible } from './DaemonProtocolVersion';
export type { IDaemonProtocolVersion } from './DaemonProtocolVersion';
export type { IDaemonClientCaps } from './DaemonClientCaps';
export { DAEMON_CONTROL_MESSAGE_KINDS, isDaemonControlMessageKind } from './DaemonControlKinds';
export type { DaemonControlMessageKind } from './DaemonControlKinds';
export type { DaemonControlMessage, DaemonEmptyPayload } from './DaemonControlMessage';
export type { IDaemonErrorMessage, IDaemonHelloAckMessage } from './DaemonControlMessage';
export type { IDaemonHelloMessage } from './DaemonControlMessage';
export type { IDaemonPingMessage, IDaemonSubscribeMessage } from './DaemonControlMessage';
export type { IDaemonUnsubscribeMessage } from './DaemonControlMessage';
export type { IDaemonRawModeChangedMessage, IDaemonSetRawModeMessage } from './DaemonInteractiveControl';
export type { IDaemonStdinEndMessage, IDaemonStdinReadyMessage } from './DaemonInteractiveControl';
export type { IDaemonTerminalPolicyMessage } from './DaemonInteractiveControl';
export type { IDaemonPongMessage } from './DaemonPongMessage';
export type { IDaemonWarmSetConfiguration, IDaemonWarmSetStatus } from './DaemonWorkspaceStatus';
export type { IDaemonWorkspaceStatus } from './DaemonWorkspaceStatus';
export type { IDaemonShutdownAckMessage, IDaemonShutdownMessage } from './DaemonLifecycleControl';
export { isDaemonControlRecord } from './ControlRecord';
export { validateDaemonControlMessage } from './ControlMessageValidation';
export { decodeDaemonControlMessage, encodeDaemonControlMessage } from './ControlFrameCodec';
export { decodeDaemonLogChunk, encodeDaemonLogChunk, type IDaemonLogChunk } from './LogFrameCodec';
export { createDaemonHello, createDaemonHelloAck, negotiateDaemonHello } from './DaemonHandshake';
export type { DaemonHandshakeOutcome } from './DaemonHandshake';
export type { DaemonJsonNull, DaemonJsonValue } from './DaemonJsonValue';
export type { DaemonCommandOutcome, IDaemonCommandResult } from './DaemonCommandResult';
export { MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS } from './DaemonRequestAdmission';
export { validateDaemonRequestAdmissionOptions } from './DaemonRequestAdmission';
export type { DaemonRequestRejectionCode, IDaemonRequestCancelMessage } from './DaemonRequestControl';
export type { IDaemonRequestRejectedMessage, IDaemonRequestResultMessage } from './DaemonRequestControl';
export type { IDaemonRequestStartMessage } from './DaemonRequestControl';
export type { IDaemonRequestEnvelope, IDaemonRequestTerminal } from './DaemonRequestEnvelope';
export type { DaemonInvocationKind } from './DaemonInvocationKind';
export type { DaemonRequestAdmissionErrorCode } from './DaemonRequestAdmission';
export type { IDaemonRequestAdmissionOptions } from './DaemonRequestAdmission';
export type { IDaemonRequestQueuePositionMessage } from './DaemonRequestAdmission';
export type { DaemonRushCommandOrigin } from './DaemonRushCommand';
export { RUSHD_GRAPH_SNAPSHOT } from './DaemonGraphSnapshot';
export type { IDaemonGraphInvalidations, IDaemonGraphOperation } from './DaemonGraphSnapshot';
export type { IDaemonGraphSnapshotPayload, IDaemonInitializedGraphSnapshot } from './DaemonGraphSnapshot';
export type { IDaemonUninitializedGraphSnapshot } from './DaemonGraphSnapshot';
export type { DaemonTerminalPolicyDecision, DaemonTerminalPolicyReason } from './DaemonTerminalPolicy';
export type { DaemonTerminalRequirement, IDaemonTerminalPolicyResult } from './DaemonTerminalPolicy';
export { decodeDaemonStdinChunk, encodeDaemonStdinChunk, type IDaemonStdinChunk } from './StdinFrameCodec';
export { DAEMON_EVENT_TYPES, isDaemonEventType, type DaemonEventType } from './DaemonEventType';
export type { DaemonEventPrivacy, IDaemonEventEnvelope, IDaemonEventScope } from './DaemonEventEnvelope';
export type { IDaemonEventSource } from './DaemonEventEnvelope';
export { isDaemonEventEnvelope, validateDaemonEventEnvelope } from './DaemonEventValidation';
export { isDaemonExtensionEventName, isRushdExtensionEventName } from './DaemonExtensionEventName';
export { RUSHD_EXTENSION_NAMESPACE } from './DaemonExtensionEventName';
export type { DaemonExtensionEventName } from './DaemonExtensionEventName';
export { compareDaemonVerbosity, isDaemonVerbosity, type DaemonVerbosity } from './DaemonVerbosity';
export { shouldSerializeDaemonEvent } from './DaemonVerbosityFilter';
export type { DaemonDiagnosticSeverity, IDaemonDiagnosticPayload } from './DaemonVerbosityFilter';
export { decodeDaemonEventFrame, encodeDaemonEventFrame } from './DaemonEventFrameCodec';
export { serializeDaemonEventForSubscription } from './DaemonEventFrameCodec';
export type { IDaemonActivityPayload, IDaemonOperationRegisteredPayload } from './DaemonOperationPayloads';
export type { IDaemonOperationStatusChangedPayload } from './DaemonOperationPayloads';
export { RUSHD_OPERATION_HEADER, RUSHD_OPERATION_STREAM_CLOSED } from './DaemonRushdExtensions';
export type { IDaemonExtensionEventPayload, IDaemonOperationHeaderPayload } from './DaemonRushdExtensions';
export type { IDaemonOperationStreamClosedPayload } from './DaemonRushdExtensions';
export type { DaemonPhasedOperationEnabledState, IDaemonPhasedEngineShape } from './DaemonPhasedRequest';
export type { IDaemonPhasedOperationResult, IDaemonPhasedOperationSelection } from './DaemonPhasedRequest';
export type { IDaemonPhasedRequest, IDaemonPhasedRequestResult } from './DaemonPhasedRequest';
