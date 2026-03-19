# Phased Command Execution and Plugin Architecture

This document describes the architecture for Rush's phased command system, including how commands execute, how the operation graph is managed, and how plugins can hook into the process.

## Overview

A **phased command** (e.g. `rush build`, `rush start`) runs a set of **operations** across projects, potentially in parallel, potentially in **watch mode** where the command runs indefinitely and re-executes operations when source files change.

The key classes involved are:

- `PhasedScriptAction` — parses CLI args, orchestrates the command lifecycle, owns `PhasedCommandHooks`
- `OperationGraph` — manages the stateful execution of operations across the entire session
- `ProjectWatcher` — drives watch mode by observing file system changes and scheduling new iterations
- `PhasedCommandHooks` — the plugin API surface exposed to Rush plugins via `runAnyPhasedCommand` / `runPhasedCommand`

---

## Command Lifecycle

### 1. Plugin registration

Before any work begins, `PhasedScriptAction.runAsync()` applies built-in plugins and fires session hooks:

```text
hooks.runAnyPhasedCommand → hooks.runPhasedCommand[actionName]
```

Built-in plugins applied (in order):

1. `PhasedOperationPlugin` — generates the default operation graph from phases and project selection
2. `ShardedPhasedOperationPlugin` — splices in sharded phases
3. `ShellOperationRunnerPlugin` — assigns `ShellOperationRunner` to operations with scripts
4. `ValidateOperationsPlugin` — validates `rush-project.json` entries
5. Conditional plugins: `ConsoleTimelinePlugin`, `NodeDiagnosticDirPlugin`, `OperationResultSummarizerPlugin`
6. Cache plugins (one of): `CacheableOperationPlugin`, `LegacySkipPlugin`, or none (full rebuild)
7. `IPCOperationRunnerPlugin` — in watch mode, enables long-running processes via IPC

### 2. Graph creation (`createOperationsAsync`)

`PhasedCommandHooks.createOperationsAsync` is fired with an empty `Set<Operation>` and an `ICreateOperationsContext`. Each tap in the waterfall may add, remove, or mutate operations. **This hook is invoked exactly once per session**, regardless of how many watch iterations occur. The resulting `Operation` objects are reused for the entire lifetime of the session. Operations cannot be added to or removed from the graph after this hook completes.

**`ICreateOperationsContext` fields:**

| Field | Description |
| --- | --- |
| `buildCacheConfiguration` | Build cache config, if enabled |
| `changedProjectsOnly` | Whether `--changed-projects-only` was passed |
| `cobuildConfiguration` | Cobuild config, if enabled |
| `customParameters` | Map of longName → CLI parameter |
| `includePhaseDeps` | Whether phase dependencies are auto-included |
| `isIncrementalBuildAllowed` | False for `rush rebuild` |
| `isWatch` | True if running in watch mode |
| `parallelism` | Configured max parallelism |
| `phaseSelection` | Set of phases to run |
| `projectConfigurations` | Loaded `rush-project.json` data |
| `projectSelection` | Set of selected projects |
| `generateFullGraph` | True when `includeAllProjectsInWatchGraph` is set and in watch mode |
| `rushConfiguration` | The Rush configuration |

### 3. OperationGraph construction

After `createOperationsAsync`, Rush constructs an `OperationGraph` from the resulting operations and fires:

```text
PhasedCommandHooks.onGraphCreatedAsync(operationGraph: IOperationGraph, context: IOperationGraphContext)
```

`IOperationGraphContext` extends `ICreateOperationsContext` with:

- `initialSnapshot?: IInputsSnapshot` — the current file system state (used to seed incremental build detection)

Plugins that tap `onGraphCreatedAsync` should register their hooks on `operationGraph.hooks` (`OperationGraphHooks`) for all per-iteration and per-operation behavior.

### 4. Execution

**Non-watch mode:** `graph.executeAsync(iterationOptions)` returns a `Promise<IExecutionResult>` that resolves when the single iteration has finished. `IExecutionResult` contains:

- `status: OperationStatus` — the overall outcome (`Success`, `Failure`, `NoOp`, etc.)
- `operationResults: ReadonlyMap<Operation, IOperationExecutionResult>` — per-operation results for the iteration

**Watch mode:** `graph.executeAsync(iterationOptions)` returns a `Promise<IExecutionResult>` for the **initial** iteration only. After that promise resolves, a `ProjectWatcher` observes file system changes. When changes are detected (after a debounce), `ProjectWatcher` calls `graph.scheduleIterationAsync(...)`, which queues a new iteration. Subsequent iterations are driven internally and their results are available via `graph.resultByOperation`. After each iteration completes with no queued work, `graph.hooks.onIdle` fires and the graph enters an idle state until the next change.

---

## OperationGraphHooks

All hooks in `OperationGraphHooks` are accessible via `operationGraph.hooks`. These are registered during `onGraphCreatedAsync`.

### Per-iteration hooks

#### `configureIteration` (Sync)

```ts
SyncHook<[
  ReadonlyMap<Operation, IConfigurableOperation>,  // initialRecords — mutable enabled state
  ReadonlyMap<Operation, IOperationExecutionResult>, // lastExecutedRecords — results from prior run
  IOperationGraphIterationOptions
]>
```

Called synchronously before an iteration is queued. Use this to enable/disable operations based on which projects changed. **Must be synchronous** — the graph may be mid-execution when this fires and the `lastExecutedRecords` map must remain stable.

When `lastExecutedRecords` is empty, this is the first iteration of the session. An operation has no entry in `lastExecutedRecords` if it has never reached a completed terminal state (`Success`, `SuccessWithWarning`, `Failure`, `FromCache`, or `NoOp`) — for example if it was `Aborted`, `Blocked`, or `Skipped` in all prior iterations.

#### `onIterationScheduled` (Sync)

```ts
SyncHook<[ReadonlyMap<Operation, IOperationExecutionResult>]>
```

Fires after an iteration is scheduled but before any operations execute. Useful for snapshotting planned work or pre-computing auxiliary data (e.g. dashboard rendering).

#### `beforeExecuteIterationAsync` (AsyncSeriesBail)

```ts
AsyncSeriesBailHook<
  [ReadonlyMap<Operation, IOperationExecutionResult>, IOperationGraphIterationOptions],
  OperationStatus | undefined | void
>
```

Fires at the start of executing a scheduled iteration. If any tap returns an `OperationStatus`, the remaining taps are skipped and the iteration ends immediately with that status; all non-started operations are marked `Aborted`.

#### `afterExecuteIterationAsync` (AsyncSeriesWaterfall)

```ts
AsyncSeriesWaterfallHook<[
  OperationStatus,
  ReadonlyMap<Operation, IOperationExecutionResult>,
  IOperationGraphIterationOptions
]>
```

Fires after all operations in an iteration have reached a final state. Taps may modify the `OperationStatus` that is returned.

#### `onIdle` (Sync)

Fires when the graph is idle and watching for file changes. Only relevant in watch mode.

### Per-operation hooks

#### `beforeExecuteOperationAsync` (AsyncSeriesBail)

```ts
AsyncSeriesBailHook<
  [IOperationRunnerContext & IOperationExecutionResult],
  OperationStatus | undefined
>
```

Fires before executing a single operation. If a tap returns a status, the runner is skipped and the operation is assigned that status (used by cache plugins to short-circuit with `FromCache`).

#### `afterExecuteOperationAsync` (AsyncSeries)

```ts
AsyncSeriesHook<[IOperationRunnerContext & IOperationExecutionResult]>
```

Fires after a single operation completes.

#### `createEnvironmentForOperation` (SyncWaterfall)

```ts
SyncWaterfallHook<[IEnvironment, IOperationRunnerContext & IOperationExecutionResult]>
```

Called to construct the environment variables passed to the operation's shell runner. Taps can add, remove, or override environment variables.

### State change hooks

#### `onExecutionStatesUpdated` (Sync)

```ts
SyncHook<[ReadonlySet<IOperationExecutionResult>]>
```

Batched hook invoked when one or more operation statuses change within the same microtask. Rather than firing once per individual status change, all changes that occur within a single microtask are collected into one set and delivered together. This reduces redundant renders or notifications when many operations update simultaneously (e.g. when a batch of operations are marked `Blocked` after an upstream failure).

#### `onEnableStatesChanged` (Sync)

```ts
SyncHook<[ReadonlySet<Operation>]>
```

Fires when `IOperationGraph.setEnabledStates()` changes the `enabled` flag on any operations.

#### `onGraphStateChanged` (Sync)

```ts
SyncHook<[IOperationGraph]>
```

Fires when any observable property of the graph changes (parallelism, quiet/debug mode, `pauseNextIteration`, status, scheduled iteration availability). Used to drive reactive UIs.

#### `onInvalidateOperations` (Sync)

```ts
SyncHook<[Iterable<Operation>, string | undefined]>
```

Fires when `IOperationGraph.invalidateOperations()` marks operations as `Ready` for re-execution.

---

## IOperationGraph API

`IOperationGraph` (implemented by `OperationGraph`) is the main handle for plugins to interact with the execution session at runtime.

### Configuration properties

| Property | Description |
| --- | --- |
| `parallelism` | Max concurrent operations (writable) |
| `debugMode` | Verbose debug output (writable) |
| `quietMode` | Suppress per-operation output except errors (writable) |
| `pauseNextIteration` | When true, scheduled iterations will not auto-execute (writable) |

### Read-only state

| Property | Description |
| --- | --- |
| `operations` | All operations in the graph (session-long set) |
| `resultByOperation` | Per-operation result records, updated live as each operation executes |
| `status` | Overall execution status (`Ready`, `Executing`, `Success`, `Failure`, etc.) |
| `hasScheduledIteration` | True if an iteration is queued but not yet running |
| `abortController` | Session-level `AbortController`; abort this to terminate watch mode |

### Methods

| Method | Description |
| --- | --- |
| `scheduleIterationAsync(options)` | Queue a new iteration; returns `true` if scheduled, `false` if nothing to do |
| `executeScheduledIterationAsync()` | Execute the currently queued iteration |
| `executeAsync(options)` | Convenience: schedule + execute in one call; returns `Promise<IExecutionResult>` with `status` and `operationResults` |
| `abortCurrentIterationAsync()` | Cancel the in-flight iteration |
| `invalidateOperations(operations?, reason?)` | Mark operations as needing re-execution |
| `setEnabledStates(operations, targetState, mode)` | Enable or disable operations (`'safe'` mode respects dependencies) |
| `closeRunnersAsync(operations?)` | Dispose long-running IPC runners |
| `addTerminalDestination(dest)` | Attach an additional `TerminalWritable` for output |
| `removeTerminalDestination(dest, close?)` | Detach a terminal destination |

---

## Watch Mode — `includeAllProjectsInWatchGraph`

When the `watchOptions.includeAllProjectsInWatchGraph` flag is set to `true` in `command-line.json`, Rush builds the operation graph with **all projects** in `rush.json`, not just the CLI-selected subset. The `generateFullGraph` property on `ICreateOperationsContext` reflects this.

This enables plugins (such as `rush-serve-plugin`) to dynamically enable/disable individual operations in the graph during the watch session by calling `IOperationGraph.setEnabledStates()`. For example, an HTTP server or WebSocket endpoint can receive a message saying "enable project X" and call `setEnabledStates` to bring it into the build graph without needing to restart the watch session.

---

## IOperationRunner

Each `Operation` carries a `runner: IOperationRunner` that performs the actual work. In watch mode the same runner instance is called once per iteration for the lifetime of the session, so runners must be written to handle multiple invocations.

### `executeAsync(context, lastState?)`

```ts
executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus>
```

`lastState` is the `IOperationExecutionResult` from the most recent iteration in which this operation **reached a completed terminal state** (`Success`, `SuccessWithWarning`, `Failure`, `FromCache`, or `NoOp`). It is `undefined` when:

- This is the first time the runner has ever been called, or
- Every prior iteration either did not reach this operation (aborted before execution began) or left it in a non-completing state (`Skipped`, `Blocked`, `Aborted`).

Runners use `lastState` to choose between a full initial build and an incremental build:

```ts
async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
  if (lastState === undefined) {
    // No completed prior result — run full build
  } else {
    // Prior result exists; check lastState.status if the outcome matters
    // e.g. re-run full build if the previous run failed
  }
}
```

`ShellOperationRunner` uses this to select between the `initialCommand` and `incrementalCommand` scripts defined in `rush-project.json`.

### `isActive`

```ts
readonly isActive?: boolean;
```

Optional. Set to `true` while the runner owns a live background resource (e.g. a running dev server or file watcher). Tooling such as the live dashboard uses this to represent an operation as "in progress" even when it is not currently executing an iteration. The runner is responsible for updating this property as the resource starts and stops.

### `closeAsync`

```ts
closeAsync?(): Promise<void>;
```

Optional. Called by `IOperationGraph.closeRunnersAsync()` when the session ends (triggered by the `abortController` abort signal). Must be **idempotent** — it may be called before any `executeAsync` call has occurred, or after the runner has already been closed. Failing to implement it defensively can cause errors during watch-mode teardown.

### Long-lived runner example

```ts
class MyWatchRunner implements IOperationRunner {
  readonly name: string;
  cacheable = false;
  reportTiming = true;
  silent = false;
  warningsAreAllowed = false;

  private _server: MyServer | undefined;

  get isActive(): boolean {
    return this._server !== undefined;
  }

  async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    if (!this._server) {
      this._server = await MyServer.startAsync();
    } else {
      await this._server.reloadAsync();
    }
    return OperationStatus.Success;
  }

  getConfigHash(): string { return ''; }

  async closeAsync(): Promise<void> {
    await this._server?.stopAsync();
    this._server = undefined;
  }
}
```

---

## Plugin patterns

### Session context in graph hooks

Session-scoped data from `IOperationGraphContext` (build cache config, project selection, phase selection, etc.) is available in the `onGraphCreatedAsync` callback and can be captured by closure for use in all graph hooks registered within it:

```ts
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph, context) => {
  const { buildCacheConfiguration, projectSelection } = context;

  graph.hooks.beforeExecuteIterationAsync.tapPromise(PLUGIN_NAME, async (records, iterationOptions) => {
    // buildCacheConfiguration and projectSelection available via closure
  });
});
```

### Self-invalidation from runners

Long-lived runners (e.g. file watchers, IPC processes) that detect stale outputs between iterations can request re-execution via `context.getInvalidateCallback()`. This returns a `(reason: string) => void` callback that delegates to `IOperationGraph.invalidateOperations()` under the hood, marking the operation as `Ready` and scheduling a new iteration. The returned callback captures only the minimal state needed, so callers should store it rather than retaining the full context.

Because `context` is always available (not just after the first completed run), runners can obtain the callback on their very first execution — there is no need to wait for a previous result.

```ts
class MyWatchRunner implements IOperationRunner {
  async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    const invalidate = context.getInvalidateCallback();
    // ... do work, set up watchers that call invalidate('files changed')
    return OperationStatus.Success;
  }
}
```

### Session teardown

To run cleanup when the watch session ends, listen to the abort signal on the graph:

```ts
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.abortController.signal.addEventListener('abort', () => {
    void myResource.dispose();
  }, { once: true });
});
```

Note that there is no built-in mechanism to await parallel teardown tasks before the process exits. `graph.closeRunnersAsync()` awaits all runner `closeAsync` calls, but other async cleanup must be coordinated manually.

---

## Plugin example

```ts
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '@microsoft/rush-lib';

export class MyPlugin implements IPhasedCommandPlugin {
  apply(hooks: PhasedCommandHooks): void {
    // Step 1: Add operations to the graph
    hooks.createOperationsAsync.tapPromise('MyPlugin', async (operations, context) => {
      // Inspect context, optionally add new Operations
      return operations;
    });

    // Step 2: Tap into the graph after it is created
    hooks.onGraphCreatedAsync.tapPromise('MyPlugin', async (graph, context) => {
      // Configure per-iteration behavior
      graph.hooks.configureIteration.tap('MyPlugin', (initialRecords, lastResults, iterationContext) => {
        // Enable/disable operations based on what changed
      });

      graph.hooks.beforeExecuteIterationAsync.tapPromise('MyPlugin', async (results, iterationContext) => {
        // Optionally short-circuit the iteration
      });

      graph.hooks.afterExecuteIterationAsync.tapPromise('MyPlugin', async (status, results, context) => {
        // Post-iteration reporting
        return status;
      });

      graph.hooks.onIdle.tap('MyPlugin', () => {
        // Display idle status
      });

      graph.hooks.onGraphStateChanged.tap('MyPlugin', (operationGraph) => {
        // React to property changes (good for live dashboards)
      });
    });
  }
}
```

---

## Key source files

| File | Description |
| --- | --- |
| `libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts` | All hook and interface definitions for phased commands |
| `libraries/rush-lib/src/logic/operations/OperationGraph.ts` | `OperationGraph` implementation (`IOperationGraph`) |
| `libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts` | Command entry point; orchestrates the full lifecycle |
| `libraries/rush-lib/src/logic/ProjectWatcher.ts` | File system watcher; drives watch mode iterations |
| `libraries/rush-lib/src/logic/operations/Operation.ts` | `Operation` node in the graph |
| `libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts` | Per-iteration execution state for an operation |
| `libraries/rush-lib/src/logic/operations/IOperationExecutionResult.ts` | Result interfaces |
| `libraries/rush-lib/src/logic/operations/IOperationRunner.ts` | `IOperationRunner` interface — `executeAsync`, `lastState`, `isActive`, `closeAsync` |
