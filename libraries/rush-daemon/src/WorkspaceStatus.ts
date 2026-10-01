// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { WorkspaceInputChangeTier } from '@microsoft/rush-lib';
import type { IDaemonWorkspaceStatus } from '@rushstack/rush-daemon-protocol';

import { describeContinuingOperations } from './PhasedRequestRouter';
import type { IWorkspaceSession } from './WorkspaceSession';
import type { WorkspaceSessionProvider } from './WorkspaceSessionProvider';

/**
 * Status must never initialize a cold graph or wait behind reload/execution leases. With `omitWarmSet`, it leaves
 * the warm set out without reading it, for a ping that only proves the daemon ready. It includes the operations that
 * the graph still runs only for requests that already have their result; see `describeContinuingOperations`.
 */
export function getWorkspaceStatus(
  provider: WorkspaceSessionProvider,
  lastReloadTier?: WorkspaceInputChangeTier,
  omitWarmSet: boolean = false
): IDaemonWorkspaceStatus {
  const session: IWorkspaceSession | undefined = provider.currentSession;
  return {
    generation: provider.generation,
    lastReloadTier,
    generationToken: provider.currentGenerationToken,
    graphInitialized: session?.operationGraph !== undefined,
    warmSet: omitWarmSet ? undefined : session?.warmSetStatus,
    continuingOperations: session ? describeContinuingOperations(session) : undefined
  };
}
