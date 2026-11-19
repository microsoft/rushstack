// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';

/**
 * Writes already-encoded bytes verbatim to a socket. Test hook used by
 * robustness tests to inject a malformed frame past the frame encoder.
 *
 * @internal
 */
export function writeRawSocketBytes(socket: net.Socket, bytes: Uint8Array): void {
  socket.write(bytes);
}
