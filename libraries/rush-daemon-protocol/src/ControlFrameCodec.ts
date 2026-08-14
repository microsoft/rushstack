// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateDaemonControlMessage } from './ControlMessageValidation';
import type { DaemonControlMessage } from './DaemonControlMessage';
import { DaemonProtocolError, DaemonProtocolErrorCode } from './DaemonProtocolError';

const UTF8: BufferEncoding = 'utf8';

/**
 * Serializes a control message as UTF-8 JSON for a `0x01` control-json frame.
 *
 * @beta
 */
export function encodeDaemonControlMessage(message: DaemonControlMessage): Buffer {
  return Buffer.from(JSON.stringify(message), UTF8);
}

function parseControlJson(payload: Buffer): unknown {
  try {
    return JSON.parse(payload.toString(UTF8)) as unknown;
  } catch (error) {
    throw new DaemonProtocolError(
      DaemonProtocolErrorCode.malformedControlMessage,
      `Control frame payload is not valid JSON: ${(error as Error).message}`
    );
  }
}

/**
 * Parses and validates the payload of a `0x01` control-json frame.
 *
 * @throws {@link DaemonProtocolError} when the payload is not valid JSON or
 * fails structural validation.
 *
 * @beta
 */
export function decodeDaemonControlMessage(payload: Buffer): DaemonControlMessage {
  const parsed: unknown = parseControlJson(payload);
  validateDaemonControlMessage(parsed);
  return parsed as DaemonControlMessage;
}
