// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  OperationStatus,
  PhasedCommandEngineBusyError,
  resolveDaemonConfiguration,
  type IDaemonConfigurationJson,
  type IOperationExecutionResult,
  type IOperationGraph,
  type IOperationRunner,
  type Operation
} from '@microsoft/rush-lib';
import type { IDaemonWarmSetStatus } from '@rushstack/rush-daemon-protocol';
import { isResourceFreeNullOperationRunner } from '@microsoft/rush-lib/lib/logic/operations/NullOperationRunner';

import {
  RequestExclusivityClass,
  RequestSchedulerError,
  RequestSchedulerErrorCode,
  type IRequestLease,
  type RequestScheduler
} from './RequestScheduler';
import { compareWarmSetRanks, type IWarmSetRank } from './WarmSetRanking';
import type { WorkspaceSessionFileWatcher } from './WorkspaceSessionFileWatcher';

/** The runtime footprint/latency policy, independent of command correctness. @beta */
export type WorkspaceWarmSetConfiguration = Pick<
  IDaemonConfigurationJson,
  'watch' | 'warmIdleTimeoutSeconds' | 'warmMemoryBudgetMB' | 'warmSetMaxProjects' | 'autoWarmByTelemetry'
>;

/** Attachment contract for one generation's real graph and watcher. @beta */
export interface IWorkspaceWarmSetOptions {
  readonly operationGraph: IOperationGraph;
  readonly configuration: WorkspaceWarmSetConfiguration;
  /** The same workspace scheduler used by builds, global requests and graph mutations. */
  readonly scheduler: RequestScheduler;
  /** Acquires native repository ownership, after exclusive workspace admission. */
  readonly acquireExecutionLeaseAsync: () => Promise<AsyncDisposable | undefined>;
  /** Already started; ownership/disposal stays with the generation. */
  readonly watcher: WorkspaceSessionFileWatcher;
  /** Additional subscriptions/resources to protect. Changes must use the workspace scheduler. */
  readonly getProtectedOperations?: () => ReadonlySet<Operation>;
  /** Optimization failures/pressure only; must not turn command results into failures. */
  readonly onDiagnostic?: (error: Error) => void;
}

/** A sampled footprint, not a hard process/tree RSS guarantee. @beta */
export type IWorkspaceWarmSetStatus = IDaemonWarmSetStatus;

interface IProjectHistory {
  readonly operations: Operation[];
  lastUsed: number;
  frequency: number;
}

interface IOperationTiming {
  coldDurationMs: number | undefined;
  timeSavedMs: number | undefined;
}

interface IWarmProject extends IWarmSetRank {
  readonly operations: ReadonlyArray<Operation>;
  readonly protected: boolean;
}

const PLUGIN_NAME: string = 'WorkspaceWarmSet';
const RETRY_DELAY_MS: number = 1000;
const MAX_POLL_DELAY_MS: number = 30_000;
const BYTES_PER_MB: number = 1024 * 1024;
const ATTACHED_GRAPHS: WeakMap<IOperationGraph, WorkspaceWarmSet> = new WeakMap();

/**
 * Retains explicitly requested work; never schedules operations or changes their enabled/result policy.
 * Attach once per generation. Dispose before disposing its graph/watcher and outside request leases.
 * @beta
 */
export class WorkspaceWarmSet implements AsyncDisposable {
  readonly #options: IWorkspaceWarmSetOptions;
  readonly #projects: Map<string, IProjectHistory> = new Map();
  readonly #timings: Map<Operation, IOperationTiming> = new Map();
  readonly #reusedRunners: WeakSet<IOperationExecutionResult> = new WeakSet();
  readonly #cleanupFailures: Map<string, string> = new Map();
  #configuration: Readonly<Required<WorkspaceWarmSetConfiguration>>;
  #timer: NodeJS.Timeout | undefined;
  #maintenance: Promise<IWorkspaceWarmSetStatus> | undefined;
  #disposed: boolean = false;
  #deferredReason: IWorkspaceWarmSetStatus['deferredReason'];
  #pressureKey: string | undefined;
  #leaseReleaseFailure: Error | undefined;
  #watcherPolicyFailure: Error | undefined;

  private constructor(options: IWorkspaceWarmSetOptions) {
    this.#options = options;
    this.#configuration = resolveWarmConfiguration(options.configuration);
    const now: number = performance.now();
    for (const operation of options.operationGraph.operations) {
      const name: string = operation.associatedProject.packageName;
      let project: IProjectHistory | undefined = this.#projects.get(name);
      if (!project) {
        project = { operations: [], lastUsed: now, frequency: 0 };
        this.#projects.set(name, project);
      }
      project.operations.push(operation);
    }
    const graph: IOperationGraph = options.operationGraph;
    graph.hooks.configureIteration.tap({ name: PLUGIN_NAME, stage: Infinity }, () => {
      if (this.#disposed) return;
      const requested: string[] = [];
      const requestedAt: number = performance.now();
      for (const [name, project] of this.#projects) {
        if (!project.operations.some((operation) => operation.enabled !== false)) continue;
        project.lastUsed = requestedAt;
        project.frequency++;
        requested.push(name);
      }
      try {
        if (this.#configuration.watch) options.watcher.watchProjects(requested);
      } catch (error) {
        this.#reportWatcherPolicyFailure(error);
      }
      this.#schedule(0);
    });
    graph.hooks.beforeExecuteOperationAsync.tap(PLUGIN_NAME, (record) => {
      if (!this.#disposed && record.operation.runner?.isActive) this.#reusedRunners.add(record);
      return undefined;
    });
    graph.hooks.afterExecuteIterationAsync.tap({ name: PLUGIN_NAME, stage: Infinity }, (status, records) => {
      if (!this.#disposed) {
        try {
          this.#recordTimings(records);
        } catch (error) {
          this.#diagnose(new Error('Could not read warm-set timing telemetry.', { cause: error }));
        }
      }
      return status;
    });
    graph.hooks.onIdle.tap(PLUGIN_NAME, () => this.#schedule(0));
    this.#schedule(0);
  }

  /**
   * Attaches policies to the actual graph. The owner must refresh inputs and revalidate effective
   * configuration on EVERY request, including requests for projects without watchers.
   */
  public static attach(options: IWorkspaceWarmSetOptions): WorkspaceWarmSet {
    if (!options.operationGraph.deleteResults) {
      throw new Error('Warm-set attachment requires a graph supporting safe retained-result deletion.');
    }
    if (ATTACHED_GRAPHS.has(options.operationGraph)) {
      throw new Error('A warm set is already attached to this graph.');
    }
    const controller: WorkspaceWarmSet = new WorkspaceWarmSet(options);
    ATTACHED_GRAPHS.set(options.operationGraph, controller);
    return controller;
  }

  /** Lets a generation adopt an integration-supplied controller without installing duplicate hooks. */
  public static getAttached(graph: IOperationGraph): WorkspaceWarmSet | undefined {
    return ATTACHED_GRAPHS.get(graph);
  }

  /** Revalidates observation and warm-resource policy and applies it on the next idle maintenance turn. */
  public updateConfiguration(configuration: WorkspaceWarmSetConfiguration): void {
    if (this.#disposed) throw new Error('The workspace warm set is disposed.');
    this.#configuration = resolveWarmConfiguration(configuration);
    this.#schedule(0);
  }

  /** Reads actual retained resources and available producer measurements without mutating the graph. */
  public getStatus(): IWorkspaceWarmSetStatus {
    const projects: IWarmProject[] = this.#rankProjects();
    let measuredRunnerMemoryBytes: number = 0;
    let unmeasuredRunnerCount: number = 0;
    for (const operation of this.#options.operationGraph.operations) {
      const runner: IOperationRunner | undefined = operation.runner;
      if (!runner || runner.isActive === false || (!runner.isActive && !runner.closeAsync)) continue;
      if (!runner.isActive && !this.#options.operationGraph.resultByOperation.has(operation)) continue;
      const bytes: number | undefined = runner.residentMemoryBytes;
      if (isMeasuredMemory(bytes)) measuredRunnerMemoryBytes += bytes;
      else unmeasuredRunnerCount++;
    }
    const daemonResidentMemoryBytes: number = process.memoryUsage().rss;
    return {
      configuration: this.#configuration,
      maintenanceState: this.#getMaintenanceState(),
      maintenanceFailure: this.#leaseReleaseFailure?.message,
      retainedProjectNames: projects.map((project) => project.key),
      projectRanks: projects.map((project) => ({
        projectName: project.key,
        frequency: project.frequency,
        lastUsed: project.lastUsed,
        timeSavedMs: project.timeSavedMs,
        measuredRunnerMemoryBytes: project.residentMemoryBytes || undefined
      })),
      protectedProjectNames: projects.filter((project) => project.protected).map((project) => project.key),
      watchedProjectNames: [...this.#options.watcher.watchedProjectNames].sort(),
      daemonResidentMemoryBytes,
      measuredRunnerMemoryBytes,
      unmeasuredRunnerCount,
      overMemoryBudget:
        daemonResidentMemoryBytes + measuredRunnerMemoryBytes >
        this.#configuration.warmMemoryBudgetMB * BYTES_PER_MB,
      overProjectLimit: projects.length > this.#configuration.warmSetMaxProjects,
      deferredReason: this.#deferredReason,
      cleanupFailures: [
        ...this.#cleanupFailures.values(),
        ...(this.#watcherPolicyFailure ? [this.#watcherPolicyFailure.message] : [])
      ]
    };
  }

  #getMaintenanceState(): IWorkspaceWarmSetStatus['maintenanceState'] {
    if (this.#leaseReleaseFailure) return 'failed';
    if (!this.#disposed) return 'running';
    return this.#maintenance ? 'quiescing' : 'stopped';
  }

  /** Runs an idle pass, or reports why it was deferred. Optional cleanup never changes build results. */
  public maintainAsync(): Promise<IWorkspaceWarmSetStatus> {
    if (!this.#maintenance) {
      this.#maintenance = this.#maintainOnceAsync().finally(() => {
        this.#maintenance = undefined;
        if (!this.#disposed && !this.#leaseReleaseFailure) {
          const now: number = performance.now();
          const delay: number = Math.min(
            MAX_POLL_DELAY_MS,
            ...this.#rankProjects().map((project) => {
              const remaining: number =
                project.lastUsed + this.#configuration.warmIdleTimeoutSeconds * 1000 - now;
              return remaining > 0 ? Math.max(1, remaining) : RETRY_DELAY_MS;
            })
          );
          this.#schedule(
            this.#deferredReason || this.#watcherPolicyFailure ? Math.min(delay, RETRY_DELAY_MS) : delay
          );
        }
      });
    }
    return this.#maintenance;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#deferredReason = 'disposed';
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    await this.#maintenance;
    if (this.#leaseReleaseFailure) throw this.#leaseReleaseFailure;
  }

  #schedule(delay: number): void {
    if (this.#disposed || this.#leaseReleaseFailure) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      // Runtime failures are diagnosed inside the maintenance boundary, not delivered as build failures.
      void this.maintainAsync().catch((error: unknown) => this.#diagnose(error));
    }, delay);
    this.#timer.unref();
  }

  async #maintainOnceAsync(): Promise<IWorkspaceWarmSetStatus> {
    let admission: IRequestLease | undefined;
    let nativeLease: AsyncDisposable | undefined;
    this.#deferredReason = undefined;
    try {
      if (this.#disposed || this.#leaseReleaseFailure) {
        this.#deferredReason = 'disposed';
      } else {
        admission = await this.#options.scheduler.acquireAsync({
          exclusivityClass: RequestExclusivityClass.Exclusive,
          noWait: true
        });
        const graph: IOperationGraph = this.#options.operationGraph;
        if (this.#disposed) {
          this.#deferredReason = 'disposed';
        } else if (isGraphBusy(graph)) {
          this.#deferredReason = 'graph-busy';
        } else {
          nativeLease = await this.#options.acquireExecutionLeaseAsync();
          if (this.#disposed) this.#deferredReason = 'disposed';
          else if (isGraphBusy(graph)) this.#deferredReason = 'graph-busy';
          else {
            await this.#evictIdleAsync();
            if (!this.#disposed) await this.#reconcileWatcherPolicyAsync();
          }
        }
      }
    } catch (error) {
      if (error instanceof RequestSchedulerError && error.code === RequestSchedulerErrorCode.NoWait) {
        this.#deferredReason = 'workspace-busy';
      } else if (error instanceof PhasedCommandEngineBusyError) {
        this.#deferredReason = 'native-busy';
      } else {
        this.#diagnose(
          new Error('Warm-set maintenance failed; retained resources may still be resident.', {
            cause: error
          })
        );
      }
    } finally {
      try {
        await nativeLease?.[Symbol.asyncDispose]();
      } catch (error) {
        this.#leaseReleaseFailure = new Error('Failed to release the warm-set native execution lease.', {
          cause: error
        });
        this.#diagnose(this.#leaseReleaseFailure);
      } finally {
        admission?.release();
      }
    }
    const status: IWorkspaceWarmSetStatus = this.getStatus();
    this.#reportPressure(status);
    return status;
  }

  async #reconcileWatcherPolicyAsync(): Promise<void> {
    const { watcher } = this.#options;
    try {
      const projects: IWarmProject[] = this.#rankProjects();
      if (this.#configuration.watch) {
        watcher.watchProjects(
          projects.filter((project) => !this.#cleanupFailures.has(project.key)).map((project) => project.key)
        );
      } else {
        await watcher.unwatchProjectsAsync(
          projects.filter((project) => !project.protected).map((project) => project.key)
        );
      }
      this.#watcherPolicyFailure = undefined;
    } catch (error) {
      this.#reportWatcherPolicyFailure(error);
    }
  }

  #reportWatcherPolicyFailure(error: unknown): void {
    const detail: string = error instanceof Error ? error.message : String(error);
    this.#watcherPolicyFailure = new Error(`Failed to apply daemon.watch project observation: ${detail}`, {
      cause: error
    });
    this.#diagnose(this.#watcherPolicyFailure);
  }

  async #evictIdleAsync(): Promise<void> {
    const { operationGraph: graph, watcher } = this.#options;
    // Retention and eviction use exactly the same ordering, reversed only to release the lowest value first.
    for (const project of this.#rankProjects().reverse()) {
      if (this.#disposed) break;
      if (project.protected) continue;
      const status: IWorkspaceWarmSetStatus = this.getStatus();
      const expired: boolean =
        performance.now() - project.lastUsed >= this.#configuration.warmIdleTimeoutSeconds * 1000;
      const unrequested: boolean =
        project.frequency === 0 &&
        project.operations.every(
          (operation) => !graph.resultByOperation.has(operation) && !operation.runner?.isActive
        );
      if (!unrequested && !expired && !status.overMemoryBudget && !status.overProjectLimit) continue;
      try {
        await graph.closeRunnersAsync(project.operations);
        if (project.operations.some((operation) => operation.runner?.isActive)) {
          throw new Error('A runner still reports active resources after close.');
        }
        await watcher.unwatchProjectsAsync([project.key]);
        graph.deleteResults!(project.operations);
        this.#cleanupFailures.delete(project.key);
      } catch (error) {
        const detail: string = error instanceof Error ? error.message : String(error);
        const message: string = `Could not evict warm project "${project.key}"; retained records were not dropped. ${detail}`;
        this.#cleanupFailures.set(project.key, message);
        this.#diagnose(new Error(message, { cause: error }));
      }
    }
  }

  #rankProjects(): IWarmProject[] {
    const { operationGraph: graph, watcher, getProtectedOperations } = this.#options;
    const protectedOperations: ReadonlySet<Operation> | undefined = getProtectedOperations?.();
    const watched: ReadonlySet<string> = watcher.watchedProjectNames;
    const projects: IWarmProject[] = [];
    for (const [key, history] of this.#projects) {
      const resident: Operation[] = history.operations.filter(
        (operation) => graph.resultByOperation.has(operation) || operation.runner?.isActive
      );
      if (!resident.length && !watched.has(key)) continue;
      let residentMemoryBytes: number | undefined = 0;
      let timeSavedMs: number | undefined = 0;
      let resourceOperationCount: number = 0;
      for (const operation of resident) {
        if (isResourceFreeNullOperationRunner(operation.runner)) continue;
        resourceOperationCount++;
        const memory: number | undefined = operation.runner?.residentMemoryBytes;
        const saved: number | undefined = this.#timings.get(operation)?.timeSavedMs;
        residentMemoryBytes =
          residentMemoryBytes !== undefined && isMeasuredMemory(memory)
            ? residentMemoryBytes + memory
            : undefined;
        timeSavedMs = timeSavedMs !== undefined && saved !== undefined ? timeSavedMs + saved : undefined;
      }
      if (resourceOperationCount === 0) {
        residentMemoryBytes = undefined;
        timeSavedMs = undefined;
      }
      projects.push({
        key,
        ...history,
        residentMemoryBytes,
        timeSavedMs,
        protected: history.operations.some((operation) => protectedOperations?.has(operation))
      });
    }
    return projects.sort((a, b) => compareWarmSetRanks(a, b, this.#configuration.autoWarmByTelemetry));
  }

  #recordTimings(records: ReadonlyMap<Operation, IOperationExecutionResult>): void {
    const now: number = performance.now();
    for (const project of this.#projects.values()) {
      if (project.operations.some((operation) => operation.enabled !== false)) project.lastUsed = now;
    }
    for (const [operation, record] of records) {
      if (
        !record.enabled ||
        !operation.runner?.reportTiming ||
        ![OperationStatus.Success, OperationStatus.SuccessWithWarning, OperationStatus.FromCache].includes(
          record.status
        )
      )
        continue;
      const durationMs: number = record.stopwatch.duration * 1000;
      if (!Number.isFinite(durationMs) || durationMs < 0) continue;
      let timing: IOperationTiming | undefined = this.#timings.get(operation);
      if (!timing) {
        timing = { coldDurationMs: undefined, timeSavedMs: undefined };
        this.#timings.set(operation, timing);
      }
      const baseline: number | undefined =
        record.status === OperationStatus.FromCache ? record.nonCachedDurationMs : timing.coldDurationMs;
      if (
        baseline !== undefined &&
        Number.isFinite(baseline) &&
        baseline >= 0 &&
        (record.status === OperationStatus.FromCache || this.#reusedRunners.has(record))
      ) {
        timing.timeSavedMs = Math.max(0, baseline - durationMs);
      } else if (!this.#reusedRunners.has(record) && record.status !== OperationStatus.FromCache) {
        timing.coldDurationMs = durationMs;
        timing.timeSavedMs = undefined;
      }
    }
  }

  #reportPressure(status: IWorkspaceWarmSetStatus): void {
    // A queued project-cap cleanup is normal during a request; status still exposes the deferral.
    if (status.deferredReason && !status.overMemoryBudget) return;
    const key: string | undefined =
      status.overMemoryBudget || status.overProjectLimit
        ? JSON.stringify([
            status.overMemoryBudget,
            status.overProjectLimit,
            status.deferredReason,
            status.protectedProjectNames,
            status.cleanupFailures,
            status.unmeasuredRunnerCount
          ])
        : undefined;
    if (key !== undefined && key !== this.#pressureKey) {
      this.#diagnose(
        new Error(
          `Warm-set pressure remains (budget ${this.#configuration.warmMemoryBudgetMB} MiB, ` +
            `limit ${this.#configuration.warmSetMaxProjects} projects): daemon RSS ${status.daemonResidentMemoryBytes} bytes, ` +
            `measured child RSS ${status.measuredRunnerMemoryBytes} bytes, ${status.unmeasuredRunnerCount} unmeasured runners, ` +
            `${status.retainedProjectNames.length} retained projects, ${status.protectedProjectNames.length} protected. ` +
            `Deferred: ${status.deferredReason ?? 'no'}. Active/protected resources and remaining daemon memory cannot be forced below the budget.`
        )
      );
    }
    this.#pressureKey = key;
  }

  #diagnose(error: unknown): void {
    const diagnostic: Error = error instanceof Error ? error : new Error(String(error));
    try {
      if (this.#options.onDiagnostic) this.#options.onDiagnostic(diagnostic);
      else
        process.emitWarning(diagnostic.message, { code: 'RUSH_DAEMON_WARM_SET', detail: diagnostic.stack });
    } catch (callbackError) {
      process.emitWarning(
        `Warm-set diagnostic callback failed: ${String(callbackError)}. ${diagnostic.message}`,
        { code: 'RUSH_DAEMON_WARM_SET' }
      );
    }
  }
}

function isMeasuredMemory(bytes: number | undefined): bytes is number {
  return bytes !== undefined && Number.isSafeInteger(bytes) && bytes > 0;
}

function isGraphBusy(graph: IOperationGraph): boolean {
  return (
    graph.hasScheduledIteration ||
    graph.status === OperationStatus.Executing ||
    graph.abortController.signal.aborted
  );
}

function resolveWarmConfiguration(
  configuration: WorkspaceWarmSetConfiguration
): Readonly<Required<WorkspaceWarmSetConfiguration>> {
  const { watch, warmIdleTimeoutSeconds, warmMemoryBudgetMB, warmSetMaxProjects, autoWarmByTelemetry } =
    resolveDaemonConfiguration(configuration, {});
  return Object.freeze({
    watch,
    warmIdleTimeoutSeconds,
    warmMemoryBudgetMB,
    warmSetMaxProjects,
    autoWarmByTelemetry
  });
}
