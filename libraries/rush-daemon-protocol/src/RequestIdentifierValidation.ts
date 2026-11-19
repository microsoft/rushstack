// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';
import { WIRE_TEXT_ENCODER } from './DaemonWireText';
import { MAX_REQUEST_ID_BYTES } from './FrameConstants';

const EMPTY_STRING_LENGTH: number = 0;

/** Validates one request identifier shared by control and binary frames. @internal */
export function validateRequestId(value: unknown): void {
  requireString(value);
  requireNonemptyTrimmed(value);
  requireEncodableLength(value);
}

function requireString(value: unknown): asserts value is string {
  if (typeof value !== 'string') fail('Request id must be a string.');
}

function requireNonemptyTrimmed(value: string): void {
  if (value.length === EMPTY_STRING_LENGTH || value.trim() !== value) {
    fail('Request id must be nonempty and trimmed.');
  }
}

function requireEncodableLength(value: string): void {
  if (WIRE_TEXT_ENCODER.encode(value).length > MAX_REQUEST_ID_BYTES) {
    fail(`Request id exceeds the maximum of ${MAX_REQUEST_ID_BYTES} UTF-8 bytes.`);
  }
}

function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
}
