// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Polyfill globalThis.crypto for Node 18, which doesn't expose it as a global.
// serialize-javascript accesses crypto.randomBytes() at module load time,
// which requires globalThis.crypto to be the Node.js crypto module.
// Remove this when deprecating nodev18 support.
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}
