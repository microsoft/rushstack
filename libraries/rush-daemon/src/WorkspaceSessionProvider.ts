// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IWorkspaceSession,
  IWorkspaceSessionOptions,
  WorkspaceSessionFactory
} from './WorkspaceSession';

export class WorkspaceSessionProvider implements AsyncDisposable {
  readonly #factory: WorkspaceSessionFactory;
  readonly #options: IWorkspaceSessionOptions;
  #disposePromise: Promise<void> | undefined;
  #initializationDisposalPromise: Promise<void> | undefined;
  #initializationPromise: Promise<IWorkspaceSession> | undefined;
  #session: IWorkspaceSession | undefined;
  #disposed: boolean = false;

  public constructor(factory: WorkspaceSessionFactory, options: IWorkspaceSessionOptions) {
    this.#factory = factory;
    this.#options = options;
  }

  public getSessionAsync(): Promise<IWorkspaceSession> {
    if (this.#disposed) {
      return Promise.reject(new Error('The workspace session provider has been disposed.'));
    }
    if (this.#session) {
      return Promise.resolve(this.#session);
    }
    if (!this.#initializationPromise) {
      const initializationPromise: Promise<IWorkspaceSession> = Promise.resolve().then(() =>
        this.#initializeAsync()
      );
      this.#initializationPromise = initializationPromise;
      void initializationPromise.catch(() => {
        if (this.#initializationPromise === initializationPromise) {
          this.#initializationPromise = undefined;
        }
      });
    }
    return this.#initializationPromise;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#disposePromise ??= this.#disposeOnceAsync();
    return this.#disposePromise;
  }

  async #disposeOnceAsync(): Promise<void> {
    this.#disposed = true;
    try {
      const session: IWorkspaceSession | undefined =
        this.#session ??
        (await this.#initializationPromise?.then(
          (initializedSession: IWorkspaceSession) => initializedSession,
          () => undefined
        ));
      if (session) {
        await session[Symbol.asyncDispose]();
      } else {
        await this.#initializationDisposalPromise;
      }
    } finally {
      this.#session = undefined;
      this.#initializationPromise = undefined;
      this.#initializationDisposalPromise = undefined;
    }
  }

  async #initializeAsync(): Promise<IWorkspaceSession> {
    const session: IWorkspaceSession = await this.#factory(this.#options);
    if (this.#disposed) {
      this.#initializationDisposalPromise = Promise.resolve().then(() =>
        session[Symbol.asyncDispose]()
      );
      await this.#initializationDisposalPromise;
      throw new Error('The workspace session provider was disposed during initialization.');
    }
    this.#session = session;
    return session;
  }
}
