// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import type {
  AiQualificationMutation,
  AiQualificationWorkerMessage,
  IAiQualificationWorkerRequest,
  IAiQualificationWorkerResult
} from './AiQualificationWorker';

export const QUALIFICATION_TEST_TIMEOUT_MS: number = 15000;
export const QUALIFICATION_CLEANUP_TIMEOUT_MS: number = 2000;
const WORK_TIMEOUT_MS: number = 12000;

type WorkerOutcome =
  | { success: true; result: IAiQualificationWorkerResult }
  | { success: false; error: Error };

export class AiQualificationTestSession {
  public readonly tempRoot: string;
  public readonly worker: Worker;
  public readonly ready: Promise<void>;
  public readonly done: Promise<WorkerOutcome>;
  readonly #complete: (outcome: WorkerOutcome) => void;

  public constructor(
    mutation: AiQualificationMutation,
    options: { waitForRelease?: boolean; timeoutAfterReadyMs?: number } = {}
  ) {
    this.tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-ai-reporter-qualification-'));
    try {
      this.worker = new Worker(path.join(__dirname, 'AiQualificationWorker.js'), {
        workerData: {
          mutation,
          tempRoot: this.tempRoot,
          waitForRelease: options.waitForRelease
        } satisfies IAiQualificationWorkerRequest
      });
    } catch (error) {
      fs.rmSync(this.tempRoot, { recursive: true, force: true });
      throw error;
    }

    let complete!: (outcome: WorkerOutcome) => void;
    const outcomePromise: Promise<WorkerOutcome> = new Promise((resolve) => {
      complete = resolve;
    });
    this.#complete = complete;
    const timedOut: () => void = () =>
      complete({ success: false, error: new Error('Qualification work timed out') });
    let workTimer: NodeJS.Timeout = setTimeout(timedOut, WORK_TIMEOUT_MS);
    let ready!: () => void;
    this.ready = new Promise((resolve) => {
      ready = resolve;
    });
    this.worker.on('message', (message: AiQualificationWorkerMessage) => {
      if (message.kind === 'ready') {
        if (options.timeoutAfterReadyMs !== undefined) {
          clearTimeout(workTimer);
          workTimer = setTimeout(timedOut, options.timeoutAfterReadyMs);
        }
        ready();
      } else {
        complete({ success: true, result: message.result });
      }
    });
    this.worker.once('error', (error: Error) => complete({ success: false, error }));
    this.worker.once('exit', (code: number) =>
      complete({ success: false, error: new Error(`Qualification worker exited without a result (${code})`) })
    );

    const worker: Worker = this.worker;
    const tempRoot: string = this.tempRoot;
    this.done = (async () => {
      const outcome: WorkerOutcome = await outcomePromise;
      clearTimeout(workTimer);
      let cleanupTimer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          (async () => {
            await worker.terminate();
            await fs.promises.rm(tempRoot, {
              recursive: true,
              force: true,
              maxRetries: 3,
              retryDelay: 100
            });
          })(),
          new Promise<never>((resolve, reject) => {
            cleanupTimer = setTimeout(
              () => reject(new Error('Qualification worker cleanup timed out')),
              QUALIFICATION_CLEANUP_TIMEOUT_MS
            );
          })
        ]);
      } finally {
        clearTimeout(cleanupTimer);
        ready();
      }
      return outcome;
    })();
  }

  public async resultAsync(): Promise<IAiQualificationWorkerResult> {
    const outcome: WorkerOutcome = await this.done;
    if (!outcome.success) {
      throw outcome.error;
    }
    return outcome.result;
  }

  public async stopAsync(): Promise<void> {
    this.#complete({ success: false, error: new Error('Qualification work cancelled during test cleanup') });
    await this.done;
  }
}
