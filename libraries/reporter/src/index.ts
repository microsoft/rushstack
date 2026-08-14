// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Canonical event protocol, reporter manager, and built-in reporters for Rush.
 *
 * @remarks
 * This package is released as a public beta. Exported contracts may change
 * before the stable release.
 *
 * @packageDocumentation
 */

/**
 * The npm package name of this package.
 *
 * @beta
 */
export const REPORTER_PACKAGE_NAME: '@rushstack/reporter' = '@rushstack/reporter';

export type { IReporterProtocolVersion } from './events/ReporterProtocolVersion';
export type { ReporterPrivacyClassification } from './events/ReporterPrivacyClassification';
export type { ReporterJsonNull, ReporterJsonValue } from './events/ReporterJsonValue';
export type { ReporterEventType } from './events/ReporterEventType';
export { REPORTER_EVENT_TYPES } from './events/ReporterEventType';
export type {
  IReporterEventSource,
  IReporterEventScope,
  IReporterEventEnvelope
} from './events/IReporterEventEnvelope';
export type {
  IActivityChangedPayload,
  IArtifactAvailablePayload,
  ICommandStartedPayload,
  IExternalOutputPayload,
  IOperationStatusChangedPayload,
  IReporterEventEnvelopeFor,
  IReporterEventPayloadMap,
  ReporterOperationStatus
} from './events/ReporterEventPayloads';

export type { RushDiagnosticSeverity, IRushDiagnostic } from './diagnostics/IRushDiagnostic';
export type { RushDiagnosticCategory } from './diagnostics/RushDiagnosticCategory';
export type { RushRemediationSafety, IRushRemediationAction } from './diagnostics/IRushRemediationAction';
export type { IRushDiagnosticSource } from './diagnostics/IRushDiagnosticSource';
export type { IClassifiedDiagnosticValue } from './diagnostics/IClassifiedDiagnosticValue';
export { getPrivacyClassificationRank, computeEnvelopePrivacyFloor } from './diagnostics/DiagnosticPrivacy';
export type {
  IRushDiagnosticCodeDefinition,
  RushDiagnosticCode
} from './diagnostics/RushDiagnosticCodeRegistry';
export {
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS,
  RUSH_DIAGNOSTIC_CODES,
  RUSH_DIAGNOSTIC_TEMPLATES
} from './diagnostics/RushDiagnosticCodeRegistry';
export {
  RUSH_DIAGNOSTIC_CODE_PREFIX,
  RUSH_INTERNAL_ERROR_CODE,
  isValidRushDiagnosticCode
} from './diagnostics/RushDiagnosticCode';
export type {
  IsRushDiagnosticCodeSegment,
  IsValidRushDiagnosticCodeTail,
  RushDiagnosticCodeCharacter,
  ValidateRushDiagnosticCode
} from './diagnostics/RushDiagnosticCode';
export type { IRushDiagnosticEntry } from './diagnostics/defineRushDiagnostic';
export { ALL_RUSH_DIAGNOSTICS } from './diagnostics/codes';
export { RushError } from './diagnostics/RushError';
export type { ICreateRushDiagnosticOptions } from './diagnostics/createRushDiagnostic';
export { createRushDiagnostic } from './diagnostics/createRushDiagnostic';

export type { IReporterProtocolLimits } from './protocol/ReporterProtocol';
export {
  REPORTER_PROTOCOL_VERSION,
  REPORTER_PROTOCOL_LIMITS,
  isReporterProtocolCompatible
} from './protocol/ReporterProtocol';
export type { INdjsonOptions } from './protocol/Ndjson';
export {
  NdjsonEncodeError,
  NdjsonInvalidRecordError,
  NdjsonRecordTooLargeError,
  encodeNdjsonRecord,
  NdjsonDecoder
} from './protocol/Ndjson';
export {
  isReporterEventEnvelope,
  isReporterHello,
  isReporterHelloAck
} from './protocol/ReporterWireGuards';
export type {
  IReporterHello,
  IReporterHelloAck,
  IReporterHandshakeOptions,
  IReporterHandshakeResult
} from './protocol/ReporterHandshake';
export { negotiateReporterHello } from './protocol/ReporterHandshake';

export type { IReporter, IReporterContext } from './manager/IReporter';
export type { IReporterRegistrationOptions, IReporterManagerOptions } from './manager/ReporterManager';
export {
  ReporterManager,
  DEFAULT_COALESCE_THRESHOLD,
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_MAX_QUEUED_EVENTS_PER_REPORTER,
  DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS
} from './manager/ReporterManager';
export { ReporterMultiplexer } from './manager/ReporterMultiplexer';

export type { IReporterEmitEventInput, IReporterEventSink } from './producers/IReporterEventSink';
export type {
  ReporterMessageSeverity,
  IScopedActivityOptions,
  IScopedArtifactOptions,
  IScopedMessageOptions,
  IScopedOperationStatusOptions,
  IScopedReporter
} from './producers/IScopedReporter';
export type {
  ReporterExtensionEventName,
  ReporterExtensionEventNameSegmentStart
} from './producers/ReporterExtensionEventName';
export { isReporterExtensionEventName } from './producers/ReporterExtensionEventName';
