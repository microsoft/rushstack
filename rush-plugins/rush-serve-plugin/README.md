# @rushstack/rush-serve-plugin

A Rush plugin that hooks into action execution and runs an express server to serve project outputs. Meant for use with watch-mode commands.

Supports HTTP/2, compression, CORS, and the new Access-Control-Allow-Private-Network header.

```
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
  IRushSessionInfo,
  ReadableOperationStatus
} from '@rushstack/rush-serve-plugin/api';

const socket: WebSocket = new WebSocket(`wss://${self.location.host}${buildStatusWebSocketPath}`);

const operationsByName: Map<string, IOperationInfo> = new Map();
let buildStatus: ReadableOperationStatus = 'Ready';

function updateOperations(operations): void {
  for (const operation of operations) {
    operationsByName.set(operation.name, operation);
  }

  for (const [operationName, operation] of operationsByName) {
    // Do something with the operation
  }
}

function updateSessionInfo(sessionInfo: IRushSessionInfo): void {
  const { actionName, repositoryIdentifier } = sessionInfo;
}

function updateBuildStatus(newStatus: ReadableOperationStatus): void {
  buildStatus = newStatus;
  // Render
}

socket.addEventListener('message', (ev) => {
  const message: IWebSocketEventMessage = JSON.parse(ev.data);

  switch (message.event) {
    case 'before-execute': {
      const { operations } = message;
      updateOperations(operations);
      updateBuildStatus('Executing');
      break;
    }

    case 'status-change': {
      const { operations } = message;
      updateOperations(operations);
      break;
    }

    case 'after-execute': {
      const { status } = message;
      updateBuildStatus(status);
      break;
    }

    case 'sync': {
      operationsByName.clear();
      const { operations, status, sessionInfo } = message;
      updateOperations(operations);
      updateSessionInfo(sessionInfo);
      updateBuildStatus(status);
      break;
    }
  }
});
```
