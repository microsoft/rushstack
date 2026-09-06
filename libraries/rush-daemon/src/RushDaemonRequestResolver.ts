// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonRequestResolver,
  IResolveDaemonRequestOptions,
  ResolvedDaemonRequest
} from './DaemonRequestDispatcher';
import { RushXDaemonRequestResolver } from './RushXDaemonRequestResolver';

/** Composes native Rushx execution with an integration-owned workspace command resolver. @beta */
export class RushDaemonRequestResolver implements IDaemonRequestResolver {
  readonly #rushResolver: IDaemonRequestResolver;
  readonly #rushxResolver: RushXDaemonRequestResolver = new RushXDaemonRequestResolver();

  public constructor(rushResolver: IDaemonRequestResolver) {
    this.#rushResolver = rushResolver;
  }

  public resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    return (options.envelope.invocationKind === 'rushx' ? this.#rushxResolver : this.#rushResolver)
      .resolveRequestAsync(options);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#rushResolver[Symbol.asyncDispose]?.();
  }
}
