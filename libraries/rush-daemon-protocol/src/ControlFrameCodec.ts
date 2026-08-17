// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateDaemonControlMessage } from './ControlMessageValidation';
import type { DaemonControlMessage } from './DaemonControlMessage';
import { DaemonProtocolError } from './DaemonProtocolError';
import { WIRE_TEXT_DECODER, WIRE_TEXT_ENCODER } from './DaemonWireText';

/**
 * Serializes a control message as UTF-8 JSON for a `0x01` control-json frame.
 *
 * @beta
 */
export function encodeDaemonControlMessage(message: DaemonControlMessage): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(JSON.stringify(message));
}

function parseControlJson(payload: Uint8Array): unknown {
  try {
    return JSON.parse(WIRE_TEXT_DECODER.decode(payload)) as unknown;
  } catch (error) {
    throw new DaemonProtocolError('malformedControlMessage', 'Control frame payload is not valid JSON.', {
      cause: error
    });
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
export function decodeDaemonControlMessage(payload: Uint8Array): DaemonControlMessage {
  const parsed: unknown = parseControlJson(payload);
  validateDaemonControlMessage(parsed);
  return parsed as DaemonControlMessage;
}
