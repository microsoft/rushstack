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

export type { RushDiagnosticSeverity, IRushDiagnostic } from './diagnostics/IRushDiagnostic';
export type { RushDiagnosticCategory } from './diagnostics/RushDiagnosticCategory';
export type { RushRemediationSafety, IRushRemediationAction } from './diagnostics/IRushRemediationAction';
export type { IRushDiagnosticSource } from './diagnostics/IRushDiagnosticSource';
export type { IClassifiedDiagnosticValue } from './diagnostics/IClassifiedDiagnosticValue';
export { getPrivacyClassificationRank, computeEnvelopePrivacyFloor } from './diagnostics/DiagnosticPrivacy';
export type { IRushDiagnosticCodeDefinition } from './diagnostics/RushDiagnosticCodeRegistry';
export {
  RUSH_INTERNAL_ERROR_CODE,
  isValidRushDiagnosticCode,
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS,
  RUSH_DIAGNOSTIC_CODES,
  RUSH_DIAGNOSTIC_TEMPLATES
} from './diagnostics/RushDiagnosticCodeRegistry';
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
export { NdjsonRecordTooLargeError, encodeNdjsonRecord, NdjsonDecoder } from './protocol/Ndjson';
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
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS
} from './manager/ReporterManager';
export { ReporterMultiplexer } from './manager/ReporterMultiplexer';

export {
  BOOTSTRAP_PROTOCOL_MAJOR,
  BOOTSTRAP_BUFFER_MAX_BYTES,
  BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME
} from './bootstrap/BootstrapProtocol';
export type {
  BootstrapPrivacyClassification,
  IBootstrapEventSource,
  IBootstrapEventInput,
  IBootstrapTruncation,
  IBootstrapEventBufferOptions
} from './bootstrap/BootstrapEventBuffer';
export { BootstrapEventBuffer } from './bootstrap/BootstrapEventBuffer';
export type { IWriteBootstrapHandoffOptions } from './bootstrap/BootstrapHandoff';
export {
  BOOTSTRAP_HANDOFF_FILE_PREFIX,
  BOOTSTRAP_HANDOFF_FILE_SUFFIX,
  isBootstrapHandoffFileName,
  writeBootstrapHandoffFileAsync,
  readBootstrapHandoffFileAsync,
  deleteBootstrapHandoffFileAsync
} from './bootstrap/BootstrapHandoff';
export type { IEarlyReporterControls } from './bootstrap/EarlyReporterControls';
export { parseEarlyReporterControls } from './bootstrap/EarlyReporterControls';

export type { IReporterHostOptions, IBootstrapReplayResult } from './frontend/ReporterHost';
export { ReporterHost, DEFAULT_HANDOFF_RETENTION_MS } from './frontend/ReporterHost';

export type {
  IReporterFrontendDescriptor,
  IReporterEngineDescriptor,
  ReporterCompatibilityMode,
  IReporterCompatibilityDecision
} from './compat/ReporterCompatibility';
export { resolveReporterCompatibility } from './compat/ReporterCompatibility';
export type { IEngineSinkResolution } from './compat/LegacyFallbackSink';
export { LegacyFallbackSink, createEngineSink } from './compat/LegacyFallbackSink';
export type { IOldEngineOutputAdapterOptions } from './compat/OldEngineOutputAdapter';
export { OldEngineOutputAdapter } from './compat/OldEngineOutputAdapter';

export type { ICreateScopedReporterOptions } from './session/ScopedReporterFactory';
export { createScopedReporter } from './session/ScopedReporterFactory';
export type { IScopedLogger } from './session/ScopedLogger';
export { createScopedLogger } from './session/ScopedLogger';
export type { IRushSessionReportingOptions, IReporterExecutionContext } from './session/RushSessionReporting';
export { RushSessionReporting } from './session/RushSessionReporting';
export type { IRushPluginManifest } from './session/PluginApi';
export {
  RUSH_PLUGIN_API_VERSION,
  isPluginApiVersionSupported,
  createPluginApiIncompatibleDiagnostic
} from './session/PluginApi';

export type {
  OperationStatus,
  ISessionStartedPayload,
  ISessionCompletedPayload,
  ICommandStartedPayload,
  ICommandCompletedPayload,
  IOperationRegisteredPayload,
  IOperationStatusChangedPayload,
  ICommandResultPayload,
  IWatchCycleCompletedPayload
} from './lifecycle/LifecycleEvents';
export type { ILifecycleEmitterOptions } from './lifecycle/LifecycleEmitter';
export { LifecycleEmitter } from './lifecycle/LifecycleEmitter';
export type { IShadowResultSummary } from './lifecycle/ShadowParity';
export { deriveExitCodeFromEvents, summarizeShadowResult } from './lifecycle/ShadowParity';

export type { TelemetryResult, ITelemetryAggregate } from './telemetry/TelemetryAggregate';
export { TELEMETRY_AGGREGATE_KEYS } from './telemetry/TelemetryAggregate';
export { TelemetrySubscriber, createTelemetryReporter } from './telemetry/TelemetrySubscriber';
export type { LegacyBeforeLogHook } from './telemetry/BeforeLogAdapter';
export { createBeforeLogAdapter } from './telemetry/BeforeLogAdapter';

export type {
  RushCommandOutcome,
  IRushExitStatus,
  IResolveExitStatusOptions,
  IResolveExitStatusFromEventsOptions
} from './exit/ExitStatus';
export {
  EXIT_CODE_SUCCESS,
  EXIT_CODE_FAILURE,
  getSignalExitCode,
  resolveExitStatus,
  resolveExitStatusFromEvents
} from './exit/ExitStatus';
export type { IJsonControls } from './exit/CommandJson';
export { separateJsonControls } from './exit/CommandJson';

export type { ReporterName, ReporterLogLevel } from './config/ReporterNames';
export {
  SUPPORTED_REPORTER_NAMES,
  SUPPORTED_LOG_LEVELS,
  isSupportedReporterName,
  isSupportedLogLevel
} from './config/ReporterNames';
export {
  COPILOT_CLI_ENV_VAR,
  KNOWN_CI_ENV_VARS,
  isAgentVariableActive,
  detectAgent,
  isCiDetected
} from './config/AgentDetection';
export type { IReporterOutputTarget } from './config/OutputControl';
export { parseOutputControl } from './config/OutputControl';
export type { IReporterSelectionInput, IReporterSelection } from './config/ReporterSelection';
export { resolveReporterSelection } from './config/ReporterSelection';

export type { IReporterEmitEventInput, IReporterEventSink } from './producers/IReporterEventSink';
export type {
  ReporterMessageSeverity,
  IScopedMessageOptions,
  IScopedReporter
} from './producers/IScopedReporter';
export type { ReporterExtensionEventName } from './producers/ReporterExtensionEventName';
export { isReporterExtensionEventName } from './producers/ReporterExtensionEventName';
