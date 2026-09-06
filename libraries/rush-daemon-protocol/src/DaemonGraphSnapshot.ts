// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonPhasedOperationEnabledState } from './DaemonPhasedRequest';

/** Experimental extension carried by the existing request event stream. @beta */
export const RUSHD_GRAPH_SNAPSHOT: 'rushd.graph-snapshot' = 'rushd.graph-snapshot';

/** JSON-safe operation metadata; never contains runners, environments or terminal output. @beta */
export interface IDaemonGraphOperation {
  readonly operationId: string;
  readonly projectName: string;
  readonly phaseName: string;
  readonly enabled: false | DaemonPhasedOperationEnabledState;
  /** Latest observed execution status, or null if no execution has been observed. */
  readonly status: string | null;
  readonly dependencyIds: ReadonlyArray<string>;
}

/** Summary of retained watcher changes, without filesystem paths. @beta */
export interface IDaemonGraphInvalidations {
  readonly sequence: number;
  readonly changedPathCount: number;
  readonly hasUnknownChanges: boolean;
  readonly isWatcherHealthy: boolean;
}

/** A cold workspace does not pretend to contain an empty, usable operation graph. @beta */
export interface IDaemonUninitializedGraphSnapshot {
  readonly initialized: false;
  readonly invalidations: IDaemonGraphInvalidations;
}

/** Point-in-time metadata for an initialized native graph. @beta */
export interface IDaemonInitializedGraphSnapshot {
  readonly initialized: true;
  readonly operations: ReadonlyArray<IDaemonGraphOperation>;
  readonly status: string;
  /** Manual mode applies to automatic iterations, not explicit build requests. */
  readonly pauseNextIteration: boolean;
  readonly hasScheduledIteration: boolean;
  readonly invalidations: IDaemonGraphInvalidations;
}

/** Data in a {@link RUSHD_GRAPH_SNAPSHOT} extension event. @beta */
export interface IDaemonGraphSnapshotPayload {
  readonly requestId: string;
  readonly snapshot: IDaemonInitializedGraphSnapshot | IDaemonUninitializedGraphSnapshot;
}
