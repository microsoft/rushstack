// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { setTimeout as delayAsync } from 'node:timers/promises';

export interface IPendingDelays {
  /** The `node:timers/promises` delays that have begun but not yet settled. */
  readonly pending: ReadonlySet<Promise<unknown>>;
  readonly restore: () => void;
}

/** Tracks the delays that are pending until `restore` is called. */
export function trackPendingDelays(): IPendingDelays {
  const timersPromises = jest.requireActual<typeof import('node:timers/promises')>('node:timers/promises');
  const originalDelayAsync: typeof delayAsync = timersPromises.setTimeout;
  const pending: Set<Promise<unknown>> = new Set();
  const spy = jest.spyOn(timersPromises, 'setTimeout').mockImplementation((delayMs, value, delayOptions) => {
    const delay: Promise<unknown> = originalDelayAsync(delayMs, value, delayOptions);
    pending.add(delay);
    const settle = (): void => {
      pending.delete(delay);
    };
    void delay.then(settle, settle);
    return delay;
  });
  return { pending, restore: () => spy.mockRestore() };
}
