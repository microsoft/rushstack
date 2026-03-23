// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'node:os';

import { FileSystem } from '@rushstack/node-core-library';

/**
 * The filename used to indicate that the Playwright Local Browser Server extension is installed.
 * @beta
 */
export const EXTENSION_INSTALLED_FILENAME: string =
  '.playwright-local-browser-server-extension-installed.txt';

/**
 * Helper to determine if the Playwright Local Browser Server extension is installed. This checks for the
 * existence of a well-known file in the OS temp directory.
 * @beta
 */
export async function isExtensionInstalledAsync(): Promise<boolean> {
  // Read file from os.tempdir() + '/.playwright-local-browser-server-extension-installed'
  const tempDir: string = tmpdir();

  const extensionInstalledFilePath: string = `${tempDir}/${EXTENSION_INSTALLED_FILENAME}`;
  const doesExist: boolean = FileSystem.exists(extensionInstalledFilePath);

  // check if file exists
  return doesExist;
}

/**
 * Normalizes an error to a string for logging purposes.
 * @beta
 */
export function getNormalizedErrorString(error: unknown): string {
  if (error instanceof Error) {
    if (error.stack) {
      return error.stack;
    }
    return error.message;
  }
  return String(error);
}

/**
 * WebSocket close codes as defined by RFC 6455.
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6455#section-11.7}
 * @beta
 */
export const WebSocketCloseCode: {
  /** Normal closure; the connection successfully completed. */
  readonly NORMAL_CLOSURE: 1000;
  /** Endpoint is going away (e.g., server shutting down, browser navigating away). */
  readonly GOING_AWAY: 1001;
  /** Protocol error encountered. */
  readonly PROTOCOL_ERROR: 1002;
  /** Received data type that cannot be accepted (e.g., text-only endpoint received binary). */
  readonly UNSUPPORTED_DATA: 1003;
  /** No status code was provided even though one was expected. */
  readonly NO_STATUS_RECEIVED: 1005;
  /** Connection was closed abnormally (e.g., without sending a close frame). */
  readonly ABNORMAL_CLOSURE: 1006;
  /** Received message data inconsistent with the message type. */
  readonly INVALID_PAYLOAD: 1007;
  /** Received a message that violates policy. */
  readonly POLICY_VIOLATION: 1008;
  /** Received a message that is too big to process. */
  readonly MESSAGE_TOO_BIG: 1009;
  /** Server encountered an unexpected condition that prevented it from fulfilling the request. */
  readonly INTERNAL_ERROR: 1011;
  /** Connection was closed due to TLS handshake failure. */
  readonly TLS_HANDSHAKE_FAILED: 1015;
} = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  NO_STATUS_RECEIVED: 1005,
  ABNORMAL_CLOSURE: 1006,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  INTERNAL_ERROR: 1011,
  TLS_HANDSHAKE_FAILED: 1015
};

/**
 * Type for WebSocket close code values.
 * @beta
 */
export type WebSocketCloseCodeValue = (typeof WebSocketCloseCode)[keyof typeof WebSocketCloseCode];

/**
 * Human-readable descriptions for WebSocket close codes.
 * @beta
 */
export const WebSocketCloseCodeDescriptions: Record<WebSocketCloseCodeValue, string> = {
  [WebSocketCloseCode.NORMAL_CLOSURE]: 'Normal Closure',
  [WebSocketCloseCode.GOING_AWAY]: 'Going Away',
  [WebSocketCloseCode.PROTOCOL_ERROR]: 'Protocol Error',
  [WebSocketCloseCode.UNSUPPORTED_DATA]: 'Unsupported Data',
  [WebSocketCloseCode.NO_STATUS_RECEIVED]: 'No Status Received',
  [WebSocketCloseCode.ABNORMAL_CLOSURE]: 'Abnormal Closure (connection lost)',
  [WebSocketCloseCode.INVALID_PAYLOAD]: 'Invalid Payload',
  [WebSocketCloseCode.POLICY_VIOLATION]: 'Policy Violation',
  [WebSocketCloseCode.MESSAGE_TOO_BIG]: 'Message Too Big',
  [WebSocketCloseCode.INTERNAL_ERROR]: 'Internal Error',
  [WebSocketCloseCode.TLS_HANDSHAKE_FAILED]: 'TLS Handshake Failed'
};

/**
 * Returns a human-readable description for a WebSocket close code.
 * @beta
 */
export function getWebSocketCloseReason(code: number): string {
  return WebSocketCloseCodeDescriptions[code as WebSocketCloseCodeValue] || 'Unknown';
}

/**
 * Returns a human-readable string for a WebSocket ready state.
 * @beta
 */
export function getWebSocketReadyStateString(readyState: number): string {
  switch (readyState) {
    case 0:
      return 'CONNECTING';
    case 1:
      return 'OPEN';
    case 2:
      return 'CLOSING';
    case 3:
      return 'CLOSED';
    default:
      return `UNKNOWN(${readyState})`;
  }
}
