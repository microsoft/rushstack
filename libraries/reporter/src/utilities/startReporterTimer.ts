// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterContext } from '../manager/IReporter';

export function startReporterTimer(
  context: IReporterContext | undefined,
  action: () => void,
  intervalMs: number
): () => void {
  const signal: AbortSignal | undefined = context?.abortSignal;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    signal?.removeEventListener('abort', stop);
  };
  if (!signal?.aborted) {
    signal?.addEventListener('abort', stop, { once: true });
    timer = setInterval(() => {
      try {
        if (context?.runWithErrorHandling) {
          context.runWithErrorHandling(action);
        } else {
          action();
        }
      } catch (error) {
        stop();
        throw error;
      }
    }, intervalMs);
    timer.unref();
  }
  return stop;
}
