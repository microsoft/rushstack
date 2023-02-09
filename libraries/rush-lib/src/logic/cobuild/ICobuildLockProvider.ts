// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/node-core-library';

export interface ILockOptions {
  lockKey: string;
  terminal: ITerminal;
}

export interface IGetCompletedStateOptions {
  key: string;
  terminal: ITerminal;
}

export interface ISetCompletedStateOptions {
  key: string;
  value: string;
  terminal: ITerminal;
}

/**
 * @beta
 */
export interface ICobuildLockProvider {
  acquireLockAsync(options: ILockOptions): Promise<boolean>;
  renewLockAsync(options: ILockOptions): Promise<void>;
  releaseLockAsync(options: ILockOptions): Promise<void>;
  setCompletedStateAsync(options: ISetCompletedStateOptions): Promise<void>;
  getCompletedStateAsync(options: IGetCompletedStateOptions): Promise<string | undefined>;
}
