// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** Effective runtime policy, not a hard process/tree RSS limit. @beta */
export interface IDaemonWarmSetConfiguration {
  /** Persistent host project observation; omitted by older peers. Never schedules builds. */
  readonly watch?: boolean;
  readonly warmIdleTimeoutSeconds: number;
  readonly warmMemoryBudgetMB: number;
  readonly warmSetMaxProjects: number;
  readonly autoWarmByTelemetry: boolean;
}

/** Actual retained resources and available producer measurements. @beta */
export interface IDaemonWarmSetStatus {
  readonly configuration: IDaemonWarmSetConfiguration;
  /** Stopping maintenance does not itself release graph/watcher resources. */
  readonly maintenanceState: 'running' | 'quiescing' | 'stopped' | 'failed';
  readonly maintenanceFailure?: string;
  /** Highest retention priority first. */
  readonly retainedProjectNames: ReadonlyArray<string>;
  readonly protectedProjectNames: ReadonlyArray<string>;
  /** Actual recursive project watchers, including pending closes. */
  readonly watchedProjectNames: ReadonlyArray<string>;
  readonly daemonResidentMemoryBytes: number;
  /** Last-completion RSS samples, excluding descendants. */
  readonly measuredRunnerMemoryBytes: number;
  /** Resident runners without a producer sample, not zero-memory runners. */
  readonly unmeasuredRunnerCount: number;
  readonly overMemoryBudget: boolean;
  readonly overProjectLimit: boolean;
  readonly deferredReason: 'workspace-busy' | 'native-busy' | 'graph-busy' | 'disposed' | undefined;
  readonly cleanupFailures: ReadonlyArray<string>;
}

/** A non-initializing snapshot of the provider's current generation. @beta */
export interface IDaemonWorkspaceStatus {
  readonly generation: number;
  /** Last lifecycle tier: 0 reuse/initial, 1 successful reload, 2 requested restart. Older peers may omit it. */
  readonly lastReloadTier?: number;
  /** Current installed session token; absent while no session is installed. */
  readonly generationToken?: string;
  /** Graph existence, not a claim of successful execution or resident children. */
  readonly graphInitialized: boolean;
  /** Absent when no warm controller is attached; absence never means measured zero memory. */
  readonly warmSet?: IDaemonWarmSetStatus;
}
