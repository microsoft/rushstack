// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ClientRequest, IncomingMessage } from 'node:http';
import https, { type Agent } from 'node:https';
import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/rush-sdk';
import type { IDependencyMetadata, IRefCount } from '../types';
import { OperationStatus } from '../externals';

export async function toArrayBuffer(message: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length: number = 0;
  // Since no encoding is set and the stream is not in object mode, chunks will be Buffer instances
  // Buffer.from(Buffer) is evidently not a no-op, per profiling, so this saves some cycles.
  for await (const chunk of message as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    length += chunk.length;
  }

  // Explicitly allocate an ArrayBuffer instance to ensure it is transferable
  // Could use SharedArrayBuffer instead; performance difference seems to be negligible
  const result: Buffer = Buffer.from(new ArrayBuffer(length));
  let offset: number = 0;
  for (const chunk of chunks) {
    chunk.copy(result, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Runner that downloads an npm package from the backing Azure Storage blob.
 */
export class DownloadOperationRunner implements IOperationRunner {
  public readonly name: string;
  // Reporting timing here would be very noisy
  public readonly reportTiming: boolean = false;
  public silent: boolean = true;
  // Has side effects
  public isSkipAllowed: boolean = false;
  // Doesn't block cache writes
  public isCacheWriteAllowed: boolean = true;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public readonly data: IDependencyMetadata;

  private readonly _agent: IRefCount<Agent>;

  public constructor(name: string, data: IDependencyMetadata, agent: IRefCount<Agent>) {
    this.name = name;
    this.data = data;
    this._agent = agent;
    this._agent.count++;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { tarball } = this.data;

    if (!tarball || !tarball.storageUrl) {
      return OperationStatus.Failure;
    }

    const { storageUrl } = tarball;

    const parsed: URL = new URL(storageUrl);
    const options: https.RequestOptions = {
      // Connection persistence is very important for performance.
      headers: { Connection: 'keep-alive' },
      agent: this._agent.ref,
      // Set timeout at 1 minute, since that is longer than a normal install takes in total on CI.
      timeout: 60000,

      host: parsed.hostname,
      protocol: parsed.protocol,
      // The query string will contain SAS tokens for authentication, so we need to include it.
      // The format of the options object weirdly treats the query string as part of the path.
      path: parsed.pathname + parsed.search
    };

    try {
      // eslint-disable-next-line require-atomic-updates
      tarball.raw = await _fetchAsync(options, 3);

      return OperationStatus.Success;
    } catch (err) {
      this.silent = false;
      context.collatedWriter.terminal.writeStderrLine(
        `Download "${tarball.integrity} (${parsed.protocol}//${parsed.host}${
          parsed.pathname
        }})" failed with: ${err.toString()}`
      );
      return OperationStatus.Failure;
    } finally {
      if (--this._agent.count === 0) {
        this._agent.ref.destroy();
      }
    }
  }
}

function getLoggingUrlFromOptions(options: https.RequestOptions): string {
  return `${options.protocol}//${options.host}${options.path!.slice(0, options.path!.indexOf('?'))}`;
}

async function _fetchAsync(options: https.RequestOptions, retryLeft: number): Promise<Buffer> {
  try {
    const response: IncomingMessage = await new Promise((resolve, reject) => {
      const request: ClientRequest = https.request(options, (res: IncomingMessage) => {
        if (res.statusCode! < 200 || res.statusCode! > 300) {
          reject(
            new Error(
              `request failed with status code ${res.statusCode}: ${getLoggingUrlFromOptions(options)}`
            )
          );
        } else {
          resolve(res);
        }
      });
      request.on('error', (e: Error) =>
        reject(new Error(`request failed\n${getLoggingUrlFromOptions(options)}\n${e.message}`))
      );
      request.end();
    });

    // We want to avoid doing any expensive processing here so that we are never blocking the event loop
    // Also to avoid the underlying network stream ever backing up.
    const buffer: Buffer = await toArrayBuffer(response);

    return buffer;
  } catch (e) {
    if (retryLeft === 0) {
      throw e;
    } else {
      return await _fetchAsync(options, retryLeft - 1);
    }
  }
}
