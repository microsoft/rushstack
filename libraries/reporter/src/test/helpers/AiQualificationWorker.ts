// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { parentPort, workerData, type MessagePort } from 'node:worker_threads';

import { AiReporter } from '../../reporters/AiReporter';
import { runAiReporterQualificationCorpusAsync } from '../../qualification/AiReporterQualificationCorpus';
import type { IAiReporterQualificationResult } from '../../qualification/AiReporterQualification';
import type { IReporterEventEnvelope } from '../../events/IReporterEventEnvelope';

export type AiQualificationMutation = 'missing-log' | 'unrelated-remediation' | 'capture-bytes';

export interface IAiQualificationWorkerRequest {
  mutation: AiQualificationMutation;
  tempRoot: string;
  waitForRelease?: boolean;
}

export interface IAiQualificationWorkerResult {
  qualification: IAiReporterQualificationResult;
  outputs: string[];
}

export type AiQualificationWorkerMessage =
  | { kind: 'ready' }
  | { kind: 'result'; result: IAiQualificationWorkerResult };

if (!parentPort) {
  throw new Error('The qualification mutation fixture must run in an owned worker.');
}
const port: MessagePort = parentPort;
const request: IAiQualificationWorkerRequest = workerData;
const report: typeof AiReporter.prototype.report = AiReporter.prototype.report;
const outputs: string[] = [];

if (request.mutation === 'capture-bytes') {
  const byteLength: typeof Buffer.byteLength = Buffer.byteLength;
  Buffer.byteLength = (...args: Parameters<typeof Buffer.byteLength>): number => {
    const [value] = args;
    if (
      typeof value === 'string' &&
      value.startsWith('{"kind":"ai.') &&
      value.includes('"kind":"ai.final"') &&
      value.endsWith('\n')
    ) {
      outputs.push(value);
    }
    return byteLength(...args);
  };
} else {
  AiReporter.prototype.report = function (event: IReporterEventEnvelope<unknown>): void {
    if (request.mutation === 'missing-log' && event.type === 'artifactAvailable') {
      return;
    }
    const payload: { remediation?: unknown } = event.payload as { remediation?: unknown };
    report.call(
      this,
      request.mutation === 'unrelated-remediation' &&
        event.type === 'diagnosticEmitted' &&
        payload.remediation !== undefined
        ? {
            ...event,
            payload: {
              ...payload,
              remediation: [
                {
                  descriptionKey: 'remediation.unrelated',
                  command: 'rush --version',
                  automatedExecutionSafety: 'safe'
                }
              ]
            }
          }
        : event
    );
  };
}

// The parent allocates the normal corpus temp path so it can also remove it after forced termination.
type TempDirectoryOptions = Parameters<typeof fs.promises.mkdtemp>[1] | fs.BufferEncodingOption;
function useOwnedTempRoot(
  prefix: string,
  options?: Exclude<TempDirectoryOptions, fs.BufferEncodingOption>
): Promise<string>;
function useOwnedTempRoot(prefix: string, options: fs.BufferEncodingOption): Promise<Buffer>;
function useOwnedTempRoot(prefix: string, options?: TempDirectoryOptions): Promise<string | Buffer>;
async function useOwnedTempRoot(prefix: string, options?: TempDirectoryOptions): Promise<string | Buffer> {
  if (!request.tempRoot.startsWith(prefix)) {
    throw new Error('Unexpected qualification temporary directory prefix');
  }
  port.postMessage({ kind: 'ready' } satisfies AiQualificationWorkerMessage);
  if (request.waitForRelease) {
    await new Promise<void>((resolve, reject) => {
      port.once('message', (message: 'run' | 'reject') => {
        if (message === 'reject') {
          reject(new Error('Injected qualification work rejection'));
        } else {
          resolve();
        }
      });
    });
  }
  const encoding: fs.ObjectEncodingOptions['encoding'] | 'buffer' =
    typeof options === 'object' ? options?.encoding : options;
  const bytes: Buffer = Buffer.from(request.tempRoot);
  return encoding === 'buffer' ? bytes : bytes.toString(encoding ?? 'utf8');
}
fs.promises.mkdtemp = useOwnedTempRoot;

void runAiReporterQualificationCorpusAsync().then(
  (qualification) => {
    port.postMessage({
      kind: 'result',
      result: { qualification, outputs }
    } satisfies AiQualificationWorkerMessage);
    port.close();
  },
  (error: unknown) => {
    port.close();
    throw error;
  }
);
