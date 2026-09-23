// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonFrameListener } from '@rushstack/rush-daemon-transport';

/** Allows tests with injected cleanup failures to release their listener after joining real resources. */
export async function captureTestDaemonListenerAsync<T>(
  createAsync: () => Promise<T>
): Promise<{ value: T; listener: DaemonFrameListener }> {
  const listenAsync: typeof DaemonFrameListener.listenAsync = DaemonFrameListener.listenAsync;
  let listener: DaemonFrameListener | undefined;
  const capture = jest.spyOn(DaemonFrameListener, 'listenAsync').mockImplementation(async (...args) => {
    listener = await listenAsync(...args);
    return listener;
  });
  try {
    const value: T = await createAsync();
    if (!listener) throw new Error('The test did not create a daemon listener.');
    return { value, listener };
  } finally {
    capture.mockRestore();
  }
}
