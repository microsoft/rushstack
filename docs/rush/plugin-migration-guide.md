# Rush Plugin Migration Guide: Phased Command Hooks

This guide covers the breaking changes to the Rush plugin API for phased commands introduced in the watch-mode overhaul. The execution engine is now stateful across an entire Rush watch session, and the hook surface has been reorganized accordingly.

## Summary of changes

| Old (removed) | New |
| --- | --- |
| `PhasedCommandHooks.createOperations` | `PhasedCommandHooks.createOperationsAsync` |
| `PhasedCommandHooks.beforeExecuteOperations` | `operationGraph.hooks.beforeExecuteIterationAsync` |
| `PhasedCommandHooks.afterExecuteOperations` | `operationGraph.hooks.afterExecuteIterationAsync` |
| `PhasedCommandHooks.onOperationStatusChanged` | `operationGraph.hooks.onExecutionStatesUpdated` |
| `PhasedCommandHooks.beforeExecuteOperation` | `operationGraph.hooks.beforeExecuteOperationAsync` |
| `PhasedCommandHooks.afterExecuteOperation` | `operationGraph.hooks.afterExecuteOperationAsync` |
| `PhasedCommandHooks.createEnvironmentForOperation` | `operationGraph.hooks.createEnvironmentForOperation` |
| `PhasedCommandHooks.waitingForChanges` | `operationGraph.hooks.onIdle` |
| `PhasedCommandHooks.shutdownAsync` | `IOperationGraph.abortController` signal + `closeRunnersAsync()` |
| `PhasedCommandHooks.beforeLog` | `operationGraph.hooks.beforeLog` |
| `IExecuteOperationsContext` | `IOperationGraphIterationOptions` (iteration scope) + `IOperationGraphContext` (session scope) |
| `WeightedOperationPlugin` | Removed — weight assignment is now part of `PhasedOperationPlugin` |

---

## Core migration pattern

Previously, all hooks were tapped directly on the `PhasedCommandHooks` object passed to `apply()`. All per-iteration and per-operation hooks have moved to a new `OperationGraphHooks` class that lives on the `IOperationGraph` object, which is created once per session and persists across watch iterations.

The new entry point for these hooks is `PhasedCommandHooks.onGraphCreatedAsync`. Register all graph-level hook taps inside this callback.

### Before

```typescript
export class MyPlugin implements IPhasedCommandPlugin {
  apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tapPromise(PLUGIN_NAME, async (operations, context) => {
      // mutate operations
      return operations;
    });

    hooks.beforeExecuteOperations.tapPromise(PLUGIN_NAME, async (records, context) => {
      // runs before each iteration
    });

    hooks.afterExecuteOperations.tapPromise(PLUGIN_NAME, async (result, context) => {
      // runs after each iteration
    });

    hooks.beforeExecuteOperation.tapPromise(PLUGIN_NAME, async (record) => {
      // runs before a single operation
      return undefined;
    });

    hooks.afterExecuteOperation.tapPromise(PLUGIN_NAME, async (record) => {
      // runs after a single operation
    });

    hooks.waitingForChanges.tap(PLUGIN_NAME, () => {
      // watch mode idle
    });
  }
}
```

### After

```typescript
export class MyPlugin implements IPhasedCommandPlugin {
  apply(hooks: PhasedCommandHooks): void {
    hooks.createOperationsAsync.tapPromise(PLUGIN_NAME, async (operations, context) => {
      // mutate operations
      return operations;
    });

    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph, context) => {
      graph.hooks.beforeExecuteIterationAsync.tapPromise(PLUGIN_NAME, async (records, iterationContext) => {
        // runs before each iteration
      });

      graph.hooks.afterExecuteIterationAsync.tapPromise(PLUGIN_NAME, async (status, records, iterationContext) => {
        // runs after each iteration
        return status;
      });

      graph.hooks.beforeExecuteOperationAsync.tapPromise(PLUGIN_NAME, async (record) => {
        // runs before a single operation
        return undefined;
      });

      graph.hooks.afterExecuteOperationAsync.tapPromise(PLUGIN_NAME, async (record) => {
        // runs after a single operation
      });

      graph.hooks.onIdle.tap(PLUGIN_NAME, () => {
        // watch mode idle
      });
    });
  }
}
```

---

## Hook-by-hook migration

### `createOperations` → `createOperationsAsync`

The hook is now async-only and has been renamed to reflect this.

**Critically, `createOperationsAsync` is now invoked exactly once per session**, regardless of how many watch iterations occur. Previously, each watch iteration called `createOperations` anew; now the same set of `Operation` objects is reused for the entire session. Plugins must not assume the hook will fire again after the initial call. Any per-iteration logic that was previously placed in `createOperations` (e.g. inspecting `isInitial` or `projectsInUnknownState`) must move to `operationGraph.hooks.configureIteration`.

```typescript
// Before
hooks.createOperations.tap(PLUGIN_NAME, (operations, context) => {
  return operations;
});

// After
hooks.createOperationsAsync.tap(PLUGIN_NAME, (operations, context) => {
  return operations;
});
// or async:
hooks.createOperationsAsync.tapPromise(PLUGIN_NAME, async (operations, context) => {
  return operations;
});
```

### `beforeExecuteOperations` → `operationGraph.hooks.beforeExecuteIterationAsync`

The context parameter has changed type. `IExecuteOperationsContext` is replaced by `IOperationGraphIterationOptions`, which only carries the iteration-scoped data (`inputsSnapshot` and `startTime`). Session-scoped data (build cache config, project selection, etc.) is available via closure from the `onGraphCreatedAsync` callback parameter.

The return signature of `beforeExecuteIterationAsync` is a bail hook: returning an `OperationStatus` short-circuits the iteration immediately.

```typescript
// Before
hooks.beforeExecuteOperations.tapPromise(PLUGIN_NAME, async (records, context) => {
  const { inputsSnapshot } = context;
  // context also had: isInitial, projectsInUnknownState, etc.
});

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph, sessionContext) => {
  graph.hooks.beforeExecuteIterationAsync.tapPromise(
    PLUGIN_NAME,
    async (records, iterationOptions) => {
      const { inputsSnapshot } = iterationOptions;
      // sessionContext has: buildCacheConfiguration, projectSelection, etc.
      // Return an OperationStatus to abort the iteration early, or return undefined to continue.
      return undefined;
    }
  );
});
```

### `afterExecuteOperations` → `operationGraph.hooks.afterExecuteIterationAsync`

The result parameter changed from `IExecutionResult` (an object with `status` and `operationResults`) to two separate parameters. The hook is now a waterfall on the status value.

```typescript
// Before
hooks.afterExecuteOperations.tapPromise(PLUGIN_NAME, async (result, context) => {
  const { status, operationResults } = result;
});

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph, context) => {
  graph.hooks.afterExecuteIterationAsync.tapPromise(
    PLUGIN_NAME,
    async (status, operationResults, iterationOptions) => {
      // Must return the (possibly modified) status
      return status;
    }
  );
});
```

### `onOperationStatusChanged` → `operationGraph.hooks.onExecutionStatesUpdated`

The old hook fired once per individual status change. The new hook is **batched**: it fires once per microtask with all changes that occurred within that tick, reducing unnecessary renders or notifications when many operations update simultaneously.

```typescript
// Before — fires per individual change
hooks.onOperationStatusChanged.tap(PLUGIN_NAME, (record) => {
  refreshUI(record);
});

// After — fires with a set of all changes in a microtask
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.hooks.onExecutionStatesUpdated.tap(PLUGIN_NAME, (changedRecords) => {
    for (const record of changedRecords) {
      refreshUI(record);
    }
  });
});
```

### `beforeExecuteOperation` → `operationGraph.hooks.beforeExecuteOperationAsync`

The hook has moved to the graph and gained the `Async` suffix to match naming conventions.

```typescript
// Before
hooks.beforeExecuteOperation.tapPromise(PLUGIN_NAME, async (record) => {
  return OperationStatus.FromCache; // short-circuit
});

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.hooks.beforeExecuteOperationAsync.tapPromise(PLUGIN_NAME, async (record) => {
    return OperationStatus.FromCache; // short-circuit
  });
});
```

### `afterExecuteOperation` → `operationGraph.hooks.afterExecuteOperationAsync`

The hook has moved to the graph and gained the `Async` suffix.

```typescript
// Before
hooks.afterExecuteOperation.tapPromise(PLUGIN_NAME, async (record) => { });

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.hooks.afterExecuteOperationAsync.tapPromise(PLUGIN_NAME, async (record) => { });
});
```

### `createEnvironmentForOperation` → `operationGraph.hooks.createEnvironmentForOperation`

The hook is now on the graph rather than on `PhasedCommandHooks`.

```typescript
// Before
hooks.createEnvironmentForOperation.tap(PLUGIN_NAME, (env, record) => {
  return { ...env, MY_VAR: 'value' };
});

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.hooks.createEnvironmentForOperation.tap(PLUGIN_NAME, (env, record) => {
    return { ...env, MY_VAR: 'value' };
  });
});
```

### `waitingForChanges` → `operationGraph.hooks.onIdle`

The hook has moved to the graph and been renamed with the standard `on` prefix.

```typescript
// Before
hooks.waitingForChanges.tap(PLUGIN_NAME, () => { });

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.hooks.onIdle.tap(PLUGIN_NAME, () => { });
});
```

### `shutdownAsync` → `IOperationGraph.abortController` + `closeRunnersAsync()`

The old `shutdownAsync` parallel hook had no direct equivalent. Shutdown is now signalled through the `AbortController` on the graph. To run cleanup logic when the session ends, listen to the abort signal. To shut down long-running runners (e.g. watch-mode IPC processes), call `graph.closeRunnersAsync()`.

```typescript
// Before
hooks.shutdownAsync.tapPromise(PLUGIN_NAME, async () => {
  await myResource.dispose();
});

// After
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
  graph.abortController.signal.addEventListener('abort', () => {
    void myResource.dispose();
  }, { once: true });
});
```

---

## `ICreateOperationsContext` — removed fields

Several fields that were on `ICreateOperationsContext` have been removed. Some have direct replacements; others reflect capabilities that no longer exist in the same form.

| Removed field | Notes |
| --- | --- |
| `isInitial` | Removed. Previously `true` on the first run, `false` on subsequent watch iterations. Because `createOperationsAsync` is now invoked only once per session, the distinction between initial and non-initial is tracked differently — see below. |
| `projectsInUnknownState` | Removed. Previously the set of projects with changed or unknown inputs. This information is now computed per-iteration inside `configureIteration` via `IInputsSnapshot` comparisons. |
| `phaseOriginal` | Removed. Was the pre-expansion set of phases. The watch phases and initial phases are now determined by the command configuration and are not exposed on the context. |
| `invalidateOperation` | Removed. Runners should use `context.getInvalidateCallback()` from `executeAsync`. Plugins can use `IOperationGraph.invalidateOperations()`, available via the graph reference from `onGraphCreatedAsync`. |

---

## Features that are no longer possible

### Distinguishing initial vs. subsequent runs

`ICreateOperationsContext` no longer has an `isInitial` flag, and `createOperationsAsync` fires only once — so the hook itself has no iteration-level context at all. The appropriate places to detect first vs. subsequent runs are:

**In `configureIteration` (plugin hooks):** The second parameter `lastExecutedRecords` is empty on the very first run and non-empty on subsequent ones:

```typescript
graph.hooks.configureIteration.tap(PLUGIN_NAME, (currentStates, lastExecutedRecords) => {
  const isFirstRun = lastExecutedRecords.size === 0;
});
```

**In `IOperationRunner.executeAsync` (custom runners):** The runner is called with a `lastState` parameter. On the first execution `lastState` is `undefined`; on subsequent iterations it holds the `IOperationExecutionResult` from the most recent iteration in which the operation **actually executed to a terminal state**. Runners should use this to decide whether to run an incremental command or a full initial build:

```typescript
class MyRunner implements IOperationRunner {
  async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    if (lastState === undefined) {
      // First execution, or the operation was never able to complete in a prior iteration
      // (e.g. it was aborted, blocked, or skipped every time) — run full build
    } else {
      // Operation previously completed — can use incremental strategy
    }
    // ...
  }
}
```

This is how `ShellOperationRunner` selects between the `initialCommand` and `incrementalCommand` scripts defined in `rush-project.json`.

> **Note:** `lastState` is only populated if the operation reached a completed terminal state (`Success`, `SuccessWithWarning`, `Failure`, `FromCache`, or `NoOp`) in a prior iteration. If the previous iteration was aborted before the operation began executing, or if the operation was `Skipped` or `Blocked`, `lastState` will still be `undefined` on the next call. Runners must not assume that a non-`undefined` `lastState` means the previous run succeeded — check `lastState.status` if the prior outcome matters for your incremental logic.
>
> To request re-execution from a long-lived runner, use `context.getInvalidateCallback()` on the `IOperationRunnerContext` to obtain a `(reason: string) => void` callback. This is available from the very first call to `executeAsync`, regardless of whether a previous result exists.

### Long-lived runners across watch iterations

Because the same `Operation` objects (and their `runner` instances) are reused for the entire session, custom `IOperationRunner` implementations must be written to handle multiple calls to `executeAsync` on the same instance. A runner that holds external resources — such as a file watcher, a dev server, or a long-running child process — is responsible for managing those resources across iterations.

Key points for custom runner authors:

- **`lastState` signals prior completion, not just re-execution.** The `lastState` parameter passed to `executeAsync` is `undefined` on the first call and on any call where the operation did not reach a completed terminal state in the previous iteration (e.g. it was aborted before it began, or was `Skipped`/`Blocked`). It is non-`undefined` only when the operation previously completed with `Success`, `SuccessWithWarning`, `Failure`, `FromCache`, or `NoOp`. Use `lastState` — and `lastState.status` if the prior outcome matters — to decide whether to perform a full or incremental build.

- **`context.getInvalidateCallback()` for self-invalidation.** Long-lived runners that detect stale outputs (e.g. file watchers, IPC processes) can call `context.getInvalidateCallback()` to obtain a lightweight `(reason: string) => void` callback that requests re-execution. This is available from the very first `executeAsync` call, regardless of whether a previous result exists. Store the returned callback rather than the full context to avoid retaining unnecessary references.

- **`isActive` tracks background ownership.** If your runner starts a background process (e.g. a dev server) that remains running between iterations, set `isActive = true` for as long as that resource is owned. This allows the dashboard and other tooling to correctly represent the operation's state.

- **`closeAsync` must be idempotent.** Rush calls `graph.closeRunnersAsync()` when the session ends (on `AbortController` abort). If your runner implements `closeAsync`, it may be called with or without a prior `executeAsync` call, or after the runner has already been closed. Implement it defensively.

- **State from one iteration does not automatically carry over.** The `IOperationExecutionResult` passed as `lastState` is a snapshot of the previous result. Mutable runner state (e.g. file handles, cached data) must be managed by the runner itself — it is not serialized or restored by Rush.

```typescript
class MyWatchRunner implements IOperationRunner {
  private _server: MyServer | undefined;

  get isActive(): boolean {
    return this._server !== undefined;
  }

  async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    if (!this._server) {
      // First execution — start the server
      this._server = await MyServer.startAsync();
    } else {
      // Subsequent execution — reload changed files
      await this._server.reloadAsync();
    }
    return OperationStatus.Success;
  }

  async closeAsync(): Promise<void> {
    await this._server?.stopAsync();
    this._server = undefined;
  }
}
```

### Accessing `projectsInUnknownState` from context

The set of projects with unknown/changed state is no longer pre-computed and passed as context. Plugins that previously consumed `projectsInUnknownState` to decide which operations to run should instead tap `configureIteration` and use the `inputsSnapshot` from `IOperationGraphIterationOptions` to compare state hashes. The built-in logic for this is handled by `PhasedOperationPlugin` and `LegacySkipPlugin`.

### Parallel shutdown via `shutdownAsync`

`shutdownAsync` was an `AsyncParallelHook` that allowed multiple plugins to run cleanup concurrently. The replacement via `AbortController` signal listeners achieves a similar result for fire-and-forget cleanup, but there is no built-in mechanism to await all parallel teardown tasks before the process exits. If your plugin needs to perform async cleanup and have it awaited, use `closeRunnersAsync` (for operation runners) or coordinate through the graph's `abortController.signal` and manage your own promises.

### Mutating the `enabled` state of operations from `createOperations`

Previously, some plugins disabled operations by mutating the record map returned from `beforeExecuteOperations`. The new model separates graph construction (session-long) from iteration configuration. Operations can only have their `enabled` state changed in `configureIteration` (synchronous) or via `IOperationGraph.setEnabledStates()` at any time. Operations cannot be added or removed from the graph after `createOperationsAsync` completes.

### `WeightedOperationPlugin`

This plugin, which assigned operation weights from `rush-project.json` settings, has been removed. Weight assignment is now performed directly by `PhasedOperationPlugin` during graph construction. External plugins that previously called `new WeightedOperationPlugin().apply(hooks)` should remove that call — the behavior is built in.

---

## Accessing session context from graph hooks

Session-scoped data from `IOperationGraphContext` (build cache config, project selection, phase selection, etc.) is available via closure in the `onGraphCreatedAsync` callback. Store what you need in local variables:

```typescript
hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph, context) => {
  const { buildCacheConfiguration, projectSelection } = context;

  graph.hooks.beforeExecuteIterationAsync.tapPromise(PLUGIN_NAME, async (records, iterationOptions) => {
    // buildCacheConfiguration and projectSelection are available here via closure
  });
});
```

## Self-invalidation from runners

Long-lived runners that need to request re-execution (e.g. a file watcher detecting changes, or an IPC process reporting stale outputs) should call `context.getInvalidateCallback()` on the `IOperationRunnerContext`. This returns a lightweight `(reason: string) => void` callback that delegates to `IOperationGraph.invalidateOperations()` under the hood. Store the returned callback rather than retaining the full context to avoid memory leaks:

```typescript
class MyWatchRunner implements IOperationRunner {
  async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    const invalidate = context.getInvalidateCallback();
    // ... set up watchers that call invalidate('files changed')
    return OperationStatus.Success;
  }
}
```

Because `context` is always available (not just after a completed prior run), runners can obtain the callback on their very first execution.

> **Note:** If you still need `IOperationGraph` for other purposes (e.g. `setEnabledStates`), the closure pattern via `onGraphCreatedAsync` is still valid. But for simple self-invalidation, prefer `getInvalidateCallback()`.
