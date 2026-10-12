// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IWorkspaceSession,
  IWorkspaceSessionOptions,
  WorkspaceSessionFactory
} from './WorkspaceSession';
import { getWorkspaceGenerationToken } from './WorkspaceGeneration';
import { assertWorkspaceRequestResourcesHealthy } from './WorkspaceRequestResources';

export class WorkspaceSessionProvider implements AsyncDisposable {
  readonly #factory: WorkspaceSessionFactory;
  readonly #options: IWorkspaceSessionOptions;
  #disposePromise: Promise<void> | undefined;
  #initializationDisposalPromise: Promise<void> | undefined;
  #initializationPromise: Promise<IWorkspaceSession> | undefined;
  #session: IWorkspaceSession | undefined;
  #disposed: boolean = false;
  #generation: number = 1;
  #reloadPromise: Promise<IWorkspaceSession> | undefined;
  #cleanupFailure: unknown;

  public get generation(): number {
    return this.#generation;
  }

  /** Reads installed state without initializing, awaiting or replacing a session or graph. */
  public get currentSession(): IWorkspaceSession | undefined {
    return this.#session;
  }

  /** The installed session token, absent while no session is installed. */
  public get currentGenerationToken(): string | undefined {
    return this.#session && getWorkspaceGenerationToken(this.#session);
  }

  public constructor(factory: WorkspaceSessionFactory, options: IWorkspaceSessionOptions) {
    this.#factory = factory;
    this.#options = options;
  }

  public getSessionAsync(): Promise<IWorkspaceSession> {
    if (this.#disposed) {
      return Promise.reject(new Error('The workspace session provider has been disposed.'));
    }
    if (this.#cleanupFailure !== undefined) return Promise.reject(this.#cleanupFailure);
    if (this.#reloadPromise) return this.#reloadPromise;
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

  /** The caller must hold lifecycle/workspace admission and the native preparation lock. */
  public reloadAsync(): Promise<IWorkspaceSession> {
    if (this.#disposed) return Promise.reject(new Error('The workspace session provider has been disposed.'));
    if (this.#cleanupFailure !== undefined) return Promise.reject(this.#cleanupFailure);
    if (!this.#reloadPromise) {
      const reload: Promise<IWorkspaceSession> = this.#reloadOnceAsync();
      this.#reloadPromise = reload;
      void reload
        .finally(() => {
          if (this.#reloadPromise === reload) this.#reloadPromise = undefined;
        })
        .catch(() => undefined);
    }
    return this.#reloadPromise;
  }

  async #reloadOnceAsync(): Promise<IWorkspaceSession> {
    const oldSession: IWorkspaceSession | undefined = this.#session ?? (await this.#initializationPromise);
    if (oldSession) {
      try {
        assertWorkspaceRequestResourcesHealthy(oldSession);
        oldSession.operationGraph?.discardScheduledIteration();
        await oldSession[Symbol.asyncDispose]();
        assertWorkspaceRequestResourcesHealthy(oldSession);
      } catch (error) {
        this.#cleanupFailure = error;
        throw error;
      }
    }
    this.#session = undefined;
    this.#initializationPromise = undefined;
    this.#generation++;
    return await this.#initializeAsync();
  }

  async #disposeOnceAsync(): Promise<void> {
    this.#disposed = true;
    try {
      await this.#reloadPromise?.catch(() => undefined);
      const session: IWorkspaceSession | undefined =
        this.#session ??
        (await this.#initializationPromise?.then(
          (initializedSession: IWorkspaceSession) => initializedSession,
          () => undefined
        ));
      if (session) {
        await session[Symbol.asyncDispose]();
        assertWorkspaceRequestResourcesHealthy(session);
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
    const session: IWorkspaceSession = await this.#factory({
      ...this.#options,
      generation: this.#generation
    });
    if (this.#disposed) {
      this.#initializationDisposalPromise = Promise.resolve().then(() => session[Symbol.asyncDispose]());
      await this.#initializationDisposalPromise;
      throw new Error('The workspace session provider was disposed during initialization.');
    }
    this.#session = session;
    return session;
  }
}
