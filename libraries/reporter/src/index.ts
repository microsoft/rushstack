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
