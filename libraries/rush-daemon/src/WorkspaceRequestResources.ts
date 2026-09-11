// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IWorkspaceSession } from './WorkspaceSession';

const CLEANUP_FAILURES: WeakMap<IWorkspaceSession, WorkspaceRequestResourceCleanupError> = new WeakMap();

export class WorkspaceRequestResourceCleanupError extends Error {
  public readonly requestId: string;

  public constructor(requestId: string, cause: unknown) {
    const detail: string = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to release resources for request "${requestId}": ${detail}`, { cause });
    this.name = 'WorkspaceRequestResourceCleanupError';
    this.requestId = requestId;
  }
}

export function recordWorkspaceRequestCleanupFailure(
  session: IWorkspaceSession,
  requestId: string,
  cause: unknown
): WorkspaceRequestResourceCleanupError {
  const failure: WorkspaceRequestResourceCleanupError =
    cause instanceof WorkspaceRequestResourceCleanupError
      ? cause
      : new WorkspaceRequestResourceCleanupError(requestId, cause);
  if (!CLEANUP_FAILURES.has(session)) CLEANUP_FAILURES.set(session, failure);
  session.retire?.();
  return failure;
}

/** A command result, later disposal, or generation reload cannot certify a failed resource join. */
export function assertWorkspaceRequestResourcesHealthy(session: IWorkspaceSession): void {
  const failure: WorkspaceRequestResourceCleanupError | undefined = CLEANUP_FAILURES.get(session);
  if (failure) throw failure;
}
