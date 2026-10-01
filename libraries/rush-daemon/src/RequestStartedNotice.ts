// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** A request's client that the daemon can tell that the request left the queue. */
export interface IRequestStartedClient {
  writeRequestStartedAsync?(): Promise<void>;
}

/**
 * Tells the client that its request left the queue, and waits until the operating system holds the frame, so that
 * the client learns it before the request can have an effect, even if the daemon exits next. A failed write is left
 * to the request's later frames, which report it.
 */
export async function writeRequestStartedAsync(client: IRequestStartedClient): Promise<void> {
  try {
    await client.writeRequestStartedAsync?.();
  } catch {
    // The client is gone, or it will see the connection close.
  }
}
