// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

/** Inputs captured once, before connecting or starting a daemon. @beta */
export interface ICaptureDaemonRequestOptions
  extends Omit<IDaemonRequestEnvelope, 'environment' | 'requestId'> {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly requestId?: string;
}

/** Copies and freezes all request-local inputs without modifying process state. @beta */
export function captureDaemonRequest(options: ICaptureDaemonRequestOptions): IDaemonRequestEnvelope {
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(options.environment).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  return Object.freeze({
    ...options,
    requestId: options.requestId ?? randomUUID(),
    argv: Object.freeze([...options.argv]),
    environment: Object.freeze(environment),
    terminal: Object.freeze({ ...options.terminal }),
    admission: options.admission && Object.freeze({ ...options.admission })
  });
}
