// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LockFile } from '@rushstack/node-core-library';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRequestResolver, IResolveDaemonRequestOptions } from './DaemonRequestDispatcher';

/** Optional lifecycle capabilities retained by resolver decorators across workspace generations. @beta */
export interface IWorkspaceResolverLifecycle {
  getCommandParameterIdentityAsync(options: IResolveDaemonRequestOptions): Promise<string>;
  createForSession(
    preparationLock?: LockFile,
    validateGraphInputsAsync?: () => Promise<void>
  ): IDaemonRequestResolver;
}

/**
 * Forwards native lifecycle capabilities while preserving the outer resolver on every generation.
 * Returns undefined when the delegated resolver has no workspace lifecycle.
 * @beta
 */
export function wrapWorkspaceResolverLifecycle(
  resolver: IDaemonRequestResolver,
  wrap: (resolver: IDaemonRequestResolver) => IDaemonRequestResolver
): IWorkspaceResolverLifecycle | undefined {
  const lifecycle: IWorkspaceResolverLifecycle | undefined = resolver.workspaceLifecycle;
  return (
    lifecycle && {
      getCommandParameterIdentityAsync: (options) => lifecycle.getCommandParameterIdentityAsync(options),
      createForSession: (lock, validateAsync) => wrap(lifecycle.createForSession(lock, validateAsync))
    }
  );
}

/** Recognizes explicit invocation metadata without treating a script name as a Rush command. @beta */
export function isRushxInvocation(envelope: IDaemonRequestEnvelope): boolean {
  return 'invocationKind' in envelope && envelope.invocationKind === 'rushx';
}
