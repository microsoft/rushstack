// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonFileChange } from '@rushstack/rush-daemon-transport';

/** How often a daemon checks that its socket still has its published name. */
export const DAEMON_SOCKET_CHECK_INTERVAL_MS: number = 5000;

/**
 * Checks at an interval that the daemon's socket still has its published name, and reports the first change.
 *
 * @remarks
 * The timer does not keep the process running. The watch stops once it reported a change, or when disposed.
 */
export class DaemonSocketWatch implements Disposable {
  #timer: NodeJS.Timeout | undefined;

  public constructor(
    checkSocket: () => DaemonFileChange | undefined,
    onChanged: (change: DaemonFileChange) => void,
    intervalMs: number = DAEMON_SOCKET_CHECK_INTERVAL_MS
  ) {
    this.#timer = setInterval(() => {
      const change: DaemonFileChange | undefined = checkSocket();
      if (!change) return;
      this[Symbol.dispose]();
      onChanged(change);
    }, intervalMs);
    this.#timer.unref();
  }

  public [Symbol.dispose](): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
