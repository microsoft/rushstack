// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IWorkspaceSession,
  IWorkspaceSessionOptions,
  WorkspaceSessionFactory
} from './WorkspaceSession';

export class WorkspaceSessionProvider {
  private readonly _factory: WorkspaceSessionFactory;
  private readonly _options: IWorkspaceSessionOptions;
  private _initializationPromise: Promise<IWorkspaceSession> | undefined;
  private _session: IWorkspaceSession | undefined;
  private _disposed: boolean = false;

  public constructor(factory: WorkspaceSessionFactory, options: IWorkspaceSessionOptions) {
    this._factory = factory;
    this._options = options;
  }

  public getSessionAsync(): Promise<IWorkspaceSession> {
    if (this._disposed) {
      return Promise.reject(new Error('The workspace session provider has been disposed.'));
    }
    if (this._session) {
      return Promise.resolve(this._session);
    }
    if (!this._initializationPromise) {
      const initializationPromise: Promise<IWorkspaceSession> = Promise.resolve().then(() =>
        this._initializeAsync()
      );
      this._initializationPromise = initializationPromise;
      void initializationPromise.catch(() => {
        if (this._initializationPromise === initializationPromise) {
          this._initializationPromise = undefined;
        }
      });
    }
    return this._initializationPromise;
  }

  public async disposeAsync(): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    const session: IWorkspaceSession | undefined =
      this._session ??
      (await this._initializationPromise?.then(
        (initializedSession: IWorkspaceSession) => initializedSession,
        () => undefined
      ));
    await session?.disposeAsync();
    this._session = undefined;
    this._initializationPromise = undefined;
  }

  private async _initializeAsync(): Promise<IWorkspaceSession> {
    const session: IWorkspaceSession = await this._factory(this._options);
    if (this._disposed) {
      await session.disposeAsync();
      throw new Error('The workspace session provider was disposed during initialization.');
    }
    this._session = session;
    return session;
  }
}
