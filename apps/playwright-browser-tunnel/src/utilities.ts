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
 * WebSocket close codes as defined by [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455#section-11.7).
 * @beta
 */
export const WS_CLOSE_CODES: Record<number, string> = {
  /* eslint-disable @typescript-eslint/naming-convention */
  1000: 'Normal Closure',
  1001: 'Going Away',
  1002: 'Protocol Error',
  1003: 'Unsupported Data',
  1005: 'No Status Received',
  1006: 'Abnormal Closure (connection lost)',
  1007: 'Invalid Payload',
  1008: 'Policy Violation',
  1009: 'Message Too Big',
  1011: 'Internal Error',
  1015: 'TLS Handshake Failed'
  /* eslint-enable @typescript-eslint/naming-convention */
};

/**
 * Returns a human-readable description for a WebSocket close code.
 * @beta
 */
export function getWebSocketCloseReason(code: number): string {
  return WS_CLOSE_CODES[code] || 'Unknown';
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
