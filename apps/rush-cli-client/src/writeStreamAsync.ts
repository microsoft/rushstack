// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Writable } from 'node:stream';

export function writeStreamAsync(destination: Writable, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    destination.once('error', onError);
    destination.write(bytes, (error?: Error | null) => {
      if (error) {
        reject(error);
      } else {
        destination.removeListener('error', onError);
        resolve();
      }
    });
  });
}
