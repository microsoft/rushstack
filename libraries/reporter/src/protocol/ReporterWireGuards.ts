// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IReporterEventEnvelope,
  IReporterEventScope,
  IReporterEventSource
} from '../events/IReporterEventEnvelope';
import { REPORTER_EVENT_TYPES, type ReporterEventType } from '../events/ReporterEventType';
import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';
import type { IReporterHello, IReporterHelloAck } from './ReporterHandshake';

function _isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function _isProtocolVersion(value: unknown): value is IReporterProtocolVersion {
  return (
    _isRecord(value) &&
    typeof value.major === 'number' &&
    Number.isFinite(value.major) &&
    typeof value.minor === 'number' &&
    Number.isFinite(value.minor)
  );
}

function _isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

function _isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function _isEventSource(value: unknown): value is IReporterEventSource {
  return (
    _isRecord(value) &&
    typeof value.packageName === 'string' &&
    typeof value.packageVersion === 'string' &&
    _isOptionalString(value.component)
  );
}

function _isEventScope(value: unknown): value is IReporterEventScope | undefined {
  return (
    value === undefined ||
    (_isRecord(value) &&
      _isOptionalString(value.commandName) &&
      _isOptionalString(value.operationId) &&
      _isOptionalString(value.projectName) &&
      _isOptionalString(value.phaseName))
  );
}

function _isPrivacyClassification(value: unknown): value is ReporterPrivacyClassification {
  return value === 'public' || value === 'local-sensitive' || value === 'secret';
}

function _isEventType(value: unknown): value is ReporterEventType {
  return typeof value === 'string' && REPORTER_EVENT_TYPES.includes(value as ReporterEventType);
}

/**
 * Returns whether an unknown wire record is a reporter hello message.
 *
 * @param value - the decoded wire record to inspect
 *
 * @beta
 */
export function isReporterHello(value: unknown): value is IReporterHello {
  return (
    _isRecord(value) &&
    value.kind === 'hello' &&
    _isProtocolVersion(value.protocolVersion) &&
    typeof value.producerVersion === 'string' &&
    _isStringArray(value.capabilities) &&
    _isStringArray(value.requiredFeatures)
  );
}

/**
 * Returns whether an unknown wire record is a reporter hello acknowledgement.
 *
 * @param value - the decoded wire record to inspect
 *
 * @beta
 */
export function isReporterHelloAck(value: unknown): value is IReporterHelloAck {
  return (
    _isRecord(value) &&
    value.kind === 'helloAck' &&
    typeof value.accepted === 'boolean' &&
    _isProtocolVersion(value.protocolVersion) &&
    _isStringArray(value.acceptedCapabilities) &&
    _isStringArray(value.rejectedRequiredFeatures)
  );
}

/**
 * Returns whether an unknown wire record has the required reporter event envelope shape.
 *
 * @param value - the decoded wire record to inspect
 *
 * @beta
 */
export function isReporterEventEnvelope(value: unknown): value is IReporterEventEnvelope {
  return (
    _isRecord(value) &&
    _isProtocolVersion(value.protocolVersion) &&
    typeof value.eventId === 'string' &&
    typeof value.sessionId === 'string' &&
    _isOptionalString(value.parentSessionId) &&
    _isOptionalString(value.parentOperationId) &&
    typeof value.sequence === 'number' &&
    Number.isFinite(value.sequence) &&
    (value.sourceSequence === undefined ||
      (typeof value.sourceSequence === 'number' && Number.isFinite(value.sourceSequence))) &&
    typeof value.timestamp === 'string' &&
    _isEventSource(value.source) &&
    _isEventScope(value.scope) &&
    _isPrivacyClassification(value.privacy) &&
    typeof value.required === 'boolean' &&
    _isEventType(value.type) &&
    Object.prototype.hasOwnProperty.call(value, 'payload')
  );
}
