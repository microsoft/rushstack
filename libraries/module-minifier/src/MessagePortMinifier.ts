// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import type * as WorkerThreads from 'node:worker_threads';

import type {
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  IModuleMinifier
} from './types';

/**
 * Minifier implementation that outsources requests to the other side of a MessagePort
 * @public
 */
export class MessagePortMinifier implements IModuleMinifier {
  public readonly port: WorkerThreads.MessagePort;

  private readonly _callbacks: Map<string, IModuleMinificationCallback[]>;

  public constructor(port: WorkerThreads.MessagePort) {
    this.port = port;
    this._callbacks = new Map();
  }

  /**
   * No-op code transform.
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { hash } = request;

    const callbacks: IModuleMinificationCallback[] | undefined = this._callbacks.get(hash);
    if (callbacks) {
      callbacks.push(callback);
      return;
    }

    this._callbacks.set(hash, [callback]);

    this.port.postMessage(request);
  }

  /**
   * {@inheritdoc IModuleMinifier.connectAsync}
   */
  public async connectAsync(): Promise<IMinifierConnection> {
    const configHashPromise: Promise<string> = once(this.port, 'message') as unknown as Promise<string>;
    this.port.postMessage('initialize');
    const configHash: string = await configHashPromise;

    const callbacks: Map<string, IModuleMinificationCallback[]> = this._callbacks;

    function handler(message: IModuleMinificationResult | number | false): void {
      if (typeof message === 'object') {
        const callbacksForRequest: IModuleMinificationCallback[] = callbacks.get(message.hash)!;
        callbacks.delete(message.hash);
        for (const callback of callbacksForRequest) {
          callback(message);
        }
      }
    }

    this.port.on('message', handler);
    const disconnectAsync: IMinifierConnection['disconnectAsync'] = async () => {
      this.port.off('message', handler);
      this.port.close();
    };
    return {
      configHash,
      disconnectAsync,
      disconnect: disconnectAsync
    };
  }

  /**
   * @deprecated Use {@link MessagePortMinifier.connectAsync} instead
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public async connect(): Promise<IMinifierConnection> {
    return await this.connectAsync();
  }
}
