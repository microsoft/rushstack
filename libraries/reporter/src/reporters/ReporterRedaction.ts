// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

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

export function redactReporterEvent(event: IReporterEventEnvelope<unknown>): IReporterEventEnvelope<unknown> {
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
  if (event.type === 'diagnosticEmitted') {
    const diagnostic: { readonly parameters?: Readonly<Record<string, IClassifiedValue>> } =
      event.payload as {
        readonly parameters?: Readonly<Record<string, IClassifiedValue>>;
      };
    if (diagnostic.parameters) {
      const parameters: Record<string, IClassifiedValue> = {};
      for (const [name, classified] of Object.entries(diagnostic.parameters)) {
        parameters[name] =
          classified.privacy === 'secret' ? { value: '[secret]', privacy: 'secret' } : classified;
      }
      payload = { ...diagnostic, parameters };
    }
  }
  return { ...event, payload };
}
