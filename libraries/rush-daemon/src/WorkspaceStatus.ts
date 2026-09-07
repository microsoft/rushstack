// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonWorkspaceStatus } from '@rushstack/rush-daemon-protocol';

import type { IWorkspaceSession } from './WorkspaceSession';
import type { WorkspaceSessionProvider } from './WorkspaceSessionProvider';

/** Status must never initialize a cold graph or wait behind reload/execution leases. */
export function getWorkspaceStatus(provider: WorkspaceSessionProvider): IDaemonWorkspaceStatus {
  const session: IWorkspaceSession | undefined = provider.currentSession;
  return {
    generation: provider.generation,
    generationToken: provider.currentGenerationToken,
    graphInitialized: session?.operationGraph !== undefined,
    warmSet: session?.warmSetStatus
  };
}
