// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOperationHeaderPayload } from '@rushstack/rush-daemon-protocol';
import type { ITerminalChunk } from '@rushstack/terminal';

import type { IOperationStreamRegistryOptions } from './OperationStreamRegistryOptions';
import { OperationStreamState } from './OperationStreamState';

export type { IOperationStreamRegistryOptions } from './OperationStreamRegistryOptions';

/**
 * Hosts the `StreamCollator` for faithful per-operation collation on the
 * client, reproducing the legacy in-process pipeline (including the
 * `==[ name ]===[ x of y ]==` headers) from id-tagged raw streams.
 *
 * @beta
 */
export class OperationStreamRegistry {
  private readonly _state: OperationStreamState;

  public constructor(options: IOperationStreamRegistryOptions) {
    this._state = new OperationStreamState(options);
  }

  /** Increments the total-operation count shown in headers. */
  public registerOperation(): void {
    this._state.registerOperation();
  }

  /** Records engine-authoritative counters before an operation's stream activates. */
  public setOperationHeader(header: IDaemonOperationHeaderPayload): void {
    this._state.setOperationHeader(header);
  }

  /** Writes one raw chunk to the operation's collated stream. */
  public writeChunk(operationId: string, chunk: ITerminalChunk): void {
    this._state.writeChunk(operationId, chunk);
  }

  /** Closes the operation's stream, flushing its collated output. */
  public closeOperation(operationId: string): void {
    this._state.closeOperation(operationId);
  }
}
