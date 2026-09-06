// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

/** The native parser to use, independently of a command's built-in/custom origin. @beta */
export type DaemonInvocationKind = 'rush' | 'rushx';

/** Validates the optional invocation discriminator. Omission retains legacy Rush routing. @internal */
export function validateDaemonInvocationKind(value: unknown): void {
  const kinds: ReadonlySet<unknown> = new Set([undefined, 'rush', 'rushx']);
  if (!kinds.has(value)) {
    throw new DaemonProtocolError('malformedControlMessage', 'Request invocation kind is not recognized.');
  }
}
