# @rushstack/rush-serve-plugin

A Rush plugin that hooks into action execution and runs an express server to serve project outputs. Meant for use with watch-mode commands.

Supports HTTP/2, compression, CORS, and the new Access-Control-Allow-Private-Network header.

```bash
# The user invokes this command
$ rush start
```

What happens:

- Rush scans for riggable `rush-serve.json` config files in all projects
- Rush uses the configuration in the aforementioned files to configure an Express server to serve project outputs as static (but not cached) content
- When a change happens to a source file, Rush's normal watch-mode machinery will rebuild all affected project phases, resulting in new files on disk
- The next time one of these files is requested, Rush will serve the new version. Optionally, may support signals for automatic refresh.

## Live Build Status via Web Socket

This plugin also provides a web socket server that notifies clients of the build status in real time. To use the server, configure the `buildStatusWebSocketPath` option in `common/config/rush-plugins/rush-serve-plugin.json`. Specifying `/` will make the web socket server available at `wss://localhost:<port>/`.

The recommended way to connect to the web socket is to serve a static HTML page from the serve plugin using the `globalRouting` configuration.

To use the socket:

```ts
import type {
  IWebSocketEventMessage,
  IOperationInfo,
  IOperationExecutionState,
  ReadableOperationStatus,
  IRushSessionInfo
} from '@rushstack/rush-serve-plugin/api';

const socket = new WebSocket(`wss://${self.location.host}${buildStatusWebSocketPath}`);

// Static graph metadata (does not include dynamic status fields)
const operationsByName: Map<string, IOperationInfo> = new Map();
// Current execution state for this iteration
const executionStates: Map<string, IOperationExecutionState> = new Map();
// Queued states for the next iteration (if an iteration has been scheduled but not yet started)
const queuedStates: Map<string, IOperationExecutionState> = new Map();

let buildStatus: ReadableOperationStatus = 'Ready';
let sessionInfo: IRushSessionInfo | undefined;

function upsertOperations(ops: IOperationInfo[]): void {
  for (const op of ops) operationsByName.set(op.name, op);
}
function upsertExecutionStates(states: IOperationExecutionState[]): void {
  for (const st of states) executionStates.set(st.name, st);
}

function applyQueuedStates(states: IOperationExecutionState[] | undefined): void {
  queuedStates.clear();
  if (states) for (const st of states) queuedStates.set(st.name, st);
}

function effectiveStatus(name: string): string | undefined {
  const exec = executionStates.get(name);
  if (exec) return exec.status;
  // Optionally fall back to last-known previous iteration results if you track them.
  return undefined;
}

socket.addEventListener('message', (ev) => {
  const msg: IWebSocketEventMessage = JSON.parse(ev.data as string);
  switch (msg.event) {
    case 'sync': {
      operationsByName.clear();
      executionStates.clear();
      upsertOperations(msg.operations);
      upsertExecutionStates(msg.currentExecutionStates);
      applyQueuedStates(msg.queuedStates);
      sessionInfo = msg.sessionInfo;
      buildStatus = msg.status;
      break;
    }
    case 'sync-operations': {
      // Static graph changed (e.g. enabled state toggles) – replace definitions only
      operationsByName.clear();
      upsertOperations(msg.operations);
      break;
    }
    case 'sync-graph-state': {
      // Graph state only – no operation arrays here
      break;
    }
    case 'iteration-scheduled': {
      applyQueuedStates(msg.queuedStates);
      break;
    }
    case 'before-execute': {
      // Start of an iteration: queuedStates become irrelevant until a new iteration is scheduled
      applyQueuedStates(undefined);
      upsertExecutionStates(msg.executionStates);
      buildStatus = 'Executing';
      break;
    }
    case 'status-change': {
      upsertExecutionStates(msg.executionStates);
      break;
    }
    case 'after-execute': {
      upsertExecutionStates(msg.executionStates);
      buildStatus = msg.status;
      // msg.lastExecutionResults (if present) can be captured for historical display
      break;
    }
  }

  // Example: iterate and render
  for (const [name, info] of operationsByName) {
    const state = executionStates.get(name);
    const status = state?.status ?? '(pending)';
    // renderRow(name, info, status, queuedStates.has(name));
  }
});
```
