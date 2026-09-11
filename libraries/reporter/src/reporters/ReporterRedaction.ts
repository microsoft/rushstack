// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import { createSecretValueMatcher } from '../diagnostics/DiagnosticSecretValues';

interface IClassifiedValue {
  readonly value: unknown;
  readonly privacy: string;
}

export function getHumanReadableMessageText(event: IReporterEventEnvelope<unknown>): string | undefined {
  if (event.privacy === 'secret') {
    return '[secret]';
  }
  const text: unknown = (event.payload as { readonly text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

export function redactReporterEvent(
  event: IReporterEventEnvelope<unknown>,
  options: { readonly forMachineOutput?: boolean } = {}
): IReporterEventEnvelope<unknown> {
  if (event.privacy === 'secret') {
    return {
      protocolVersion: event.protocolVersion,
      eventId: event.eventId,
      sessionId: event.sessionId,
      sequence: event.sequence,
      sourceSequence: event.sourceSequence,
      timestamp: event.timestamp,
      source: {
        packageName: '[private-producer]',
        packageVersion: '[private-version]'
      },
      privacy: 'secret',
      required: event.required,
      type: event.type,
      payload: '[secret]'
    };
  }

  let payload: unknown = event.payload;
  let source: IReporterEventEnvelope<unknown>['source'] = event.source;
  if (event.type === 'diagnosticEmitted') {
    const diagnostic: {
      readonly parameters?: Readonly<Record<string, IClassifiedValue>>;
      readonly source?: unknown;
    } = event.payload as {
      readonly parameters?: Readonly<Record<string, IClassifiedValue>>;
      readonly source?: unknown;
    };
    const redactedDiagnostic: {
      parameters?: Record<string, IClassifiedValue>;
      source?: unknown;
    } = { ...diagnostic };
    if (options.forMachineOutput) {
      const containsSecret: (text: string) => boolean = createSecretValueMatcher(
        Object.values(diagnostic.parameters ?? {})
      );
      if (containsSecret(source.packageName)) {
        // A component/version still identifies the producer whose package name is classified secret.
        source = { packageName: '[private-producer]', packageVersion: '[private-version]' };
      } else {
        source = {
          ...source,
          packageVersion: containsSecret(source.packageVersion) ? '[private-version]' : source.packageVersion,
          component:
            source.component !== undefined && containsSecret(source.component) ? undefined : source.component
        };
      }
      if (
        diagnostic.source !== null &&
        typeof diagnostic.source === 'object' &&
        !Array.isArray(diagnostic.source)
      ) {
        redactedDiagnostic.source = Object.fromEntries(
          Object.entries(diagnostic.source).map(([name, value]) => [
            name,
            (name === 'file' || name === 'toolName') &&
            typeof value === 'string' &&
            containsSecret(value)
              ? '[secret]'
              : value
          ])
        );
      }
    }
    if (diagnostic.parameters) {
      const parameters: Record<string, IClassifiedValue> = {};
      for (const [name, classified] of Object.entries(diagnostic.parameters)) {
        parameters[name] =
          classified.privacy === 'secret' ? { value: '[secret]', privacy: 'secret' } : classified;
      }
      redactedDiagnostic.parameters = parameters;
    }
    payload = redactedDiagnostic;
  }
  return { ...event, source, payload };
}
