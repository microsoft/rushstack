// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Envelope construction for the wire adapter.

import type { DaemonEventType, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

const SCHEMA_VERSION = { major: 0, minor: 1 } as const;
const SOURCE = { packageName: '@microsoft/rush-lib', packageVersion: '0.0.0' } as const;
const SESSION_ID: string = 'e2e-session';

/** Optional envelope extras applied by the adapter. */
export interface IWireEnvelopeOptions {
  readonly scope?: { operationId: string };
  readonly required?: boolean;
}

/** Builds a structurally complete event envelope for the e2e wire stream. */
export function buildWireEnvelope(
  type: DaemonEventType,
  payload: unknown,
  sequence: number,
  options?: IWireEnvelopeOptions
): IDaemonEventEnvelope {
  return {
    protocolVersion: SCHEMA_VERSION,
    eventId: `evt-${sequence}`,
    sessionId: SESSION_ID,
    sequence,
    timestamp: new Date().toISOString(),
    source: SOURCE,
    scope: options?.scope,
    privacy: 'public',
    required: options?.required === true,
    type,
    payload
  };
}
