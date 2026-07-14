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

export type { IReporterEmitEventInput, IReporterEventSink } from './producers/IReporterEventSink';
export type {
  ReporterMessageSeverity,
  IScopedMessageOptions,
  IScopedReporter
} from './producers/IScopedReporter';
export type { ReporterExtensionEventName } from './producers/ReporterExtensionEventName';
export { isReporterExtensionEventName } from './producers/ReporterExtensionEventName';
