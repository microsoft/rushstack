// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Http2SecureServer } from 'node:http2';
import type { Server as HTTPSecureServer } from 'node:https';
import os from 'node:os';

import { type WebSocket, WebSocketServer, type MessageEvent } from 'ws';

import { Sort } from '@rushstack/node-core-library/lib/Sort';
import {
  type Operation,
  type IOperationExecutionResult,
  OperationStatus,
  type ILogFilePaths,
  type RushConfiguration,
  type IOperationExecutionManager
} from '@rushstack/rush-sdk';
import { type ITerminalChunk, TerminalChunkKind, TerminalWritable } from '@rushstack/terminal';

import type {
  ReadableOperationStatus,
  ILogFileURLs,
  IOperationInfo,
  IOperationExecutionState,
  IWebSocketEventMessage,
  IRushSessionInfo,
  IWebSocketSyncEventMessage,
  IWebSocketBeforeExecuteEventMessage,
  IWebSocketAfterExecuteEventMessage,
  IWebSocketBatchStatusChangeEventMessage,
  IWebSocketCommandMessage,
  IWebSocketPassQueuedEventMessage,
  IWebSocketSyncOperationsEventMessage,
  IWebSocketTerminalChunkEventMessage
} from './api.types';
import { PLUGIN_NAME } from './constants';
import type { IPhasedCommandHandlerOptions } from './types';

export type WebSocketServerUpgrader = (server: Http2SecureServer) => void;

/**
 * Returns a string that identifies the repository, based on the Rush configuration and environment.
 * @param rushConfiguration - The Rush configuration object.
 * @returns A string identifier for the repository.
 */
export function getRepositoryIdentifier(rushConfiguration: RushConfiguration): string {
  const { env } = process;
  const { CODESPACE_NAME: codespaceName, GITHUB_USER: githubUserName } = env;

  if (codespaceName) {
    const usernamePrefix: string | undefined = githubUserName?.replace(/_|$/g, '-');
    const startIndex: number =
      usernamePrefix && codespaceName.startsWith(usernamePrefix) ? usernamePrefix.length : 0;
    const endIndex: number = codespaceName.lastIndexOf('-');
    const normalizedName: string = codespaceName.slice(startIndex, endIndex).replace(/-/g, ' ');
    return `Codespace "${normalizedName}"`;
  }

  return `${os.hostname()} - ${rushConfiguration.rushJsonFolder}`;
}

/**
 * @param logServePath - The base URL path where logs are being served.
 * @param packageName - The npm package name of the project.
 * @returns The base URL path for serving logs of the specified project.
 */
export function getLogServePathForProject(logServePath: string, packageName: string): string {
  return `${logServePath}/${packageName}`;
}

export class WebSocketTerminalWritable extends TerminalWritable {
  private _webSockets: ReadonlySet<WebSocket>;

  public constructor(webSockets: ReadonlySet<WebSocket>) {
    super();
    this._webSockets = webSockets;
  }

  protected override onWriteChunk(chunk: ITerminalChunk): void {
    const message: IWebSocketTerminalChunkEventMessage = {
      event: 'terminal-chunk',
      kind: chunk.kind === TerminalChunkKind.Stderr ? 'stderr' : 'stdout',
      text: chunk.text
    };
    const stringifiedMessage: string = JSON.stringify(message);
    for (const ws of this._webSockets) {
      ws.send(stringifiedMessage);
    }
  }
}

/**
 * If the `buildStatusWebSocketPath` option is configured, this function returns a `WebSocketServerUpgrader` callback
 * that can be used to add a WebSocket server to the HTTPS server. The WebSocket server sends messages
 * about operation status changes to connected clients.
 *
 */
export function tryEnableBuildStatusWebSocketServer(
  options: IPhasedCommandHandlerOptions
): WebSocketServerUpgrader | undefined {
  const { buildStatusWebSocketPath } = options;
  if (!buildStatusWebSocketPath) {
    return;
  }

  const operationStates: Map<string, IOperationExecutionResult> = new Map();
  let buildStatus: ReadableOperationStatus = 'Ready';

  const webSockets: Set<WebSocket> = new Set();

  // Map from OperationStatus enum values back to the names of the constants
  const readableStatusFromStatus: {
    [K in OperationStatus]: ReadableOperationStatus;
  } = {
    [OperationStatus.Waiting]: 'Waiting',
    [OperationStatus.Ready]: 'Ready',
    [OperationStatus.Queued]: 'Queued',
    [OperationStatus.Executing]: 'Executing',
    [OperationStatus.Success]: 'Success',
    [OperationStatus.SuccessWithWarning]: 'SuccessWithWarning',
    [OperationStatus.Skipped]: 'Skipped',
    [OperationStatus.FromCache]: 'FromCache',
    [OperationStatus.Failure]: 'Failure',
    [OperationStatus.Blocked]: 'Blocked',
    [OperationStatus.NoOp]: 'NoOp',
    [OperationStatus.Aborted]: 'Aborted'
  };

  const { logServePath } = options;

  function convertToLogFileUrls(
    logFilePaths: ILogFilePaths | undefined,
    packageName: string
  ): ILogFileURLs | undefined {
    if (!logFilePaths || !logServePath) {
      return;
    }

    const projectLogServePath: string = getLogServePathForProject(logServePath, packageName);

    const logFileUrls: ILogFileURLs = {
      text: `${projectLogServePath}${logFilePaths.text.slice(logFilePaths.textFolder.length)}`,
      error: `${projectLogServePath}${logFilePaths.error.slice(logFilePaths.textFolder.length)}`,
      jsonl: `${projectLogServePath}${logFilePaths.jsonl.slice(logFilePaths.jsonlFolder.length)}`
    };

    return logFileUrls;
  }

  /**
   * Maps the internal Rush record down to a subset that is JSON-friendly and human readable.
   */
  function convertToOperationInfo(operation: Operation): IOperationInfo | undefined {
    const { name, associatedPhase, associatedProject, runner, enabled } = operation;

    if (!name || !runner) {
      return;
    }

    const { packageName } = associatedProject;

    return {
      name,
      dependencies: Array.from(operation.dependencies, (dep) => dep.name),
      packageName,
      phaseName: associatedPhase.name,
      enabled:
        enabled === false
          ? 'never'
          : enabled === 'ignore-dependency-changes'
            ? 'ignore-dependency-changes'
            : 'affected',
      silent: runner.silent,
      noop: !!runner.isNoOp
    };
  }

  function convertToExecutionState(record: IOperationExecutionResult): IOperationExecutionState | undefined {
    const { operation } = record;
    const { name, associatedProject, runner } = operation;
    if (!name || !runner) return;
    const { packageName } = associatedProject;
    return {
      name,
      runInThisPass: record.enabled,
      isActive: !!runner.isActive,
      status: readableStatusFromStatus[record.status],
      startTime: record.stopwatch.startTime,
      endTime: record.stopwatch.endTime,
      logFileURLs: convertToLogFileUrls(record.logFilePaths, packageName)
    };
  }

  function convertToOperationInfoArray(operations: Iterable<Operation>): IOperationInfo[] {
    const infos: IOperationInfo[] = [];

    for (const operation of operations) {
      const info: IOperationInfo | undefined = convertToOperationInfo(operation);

      if (info) {
        infos.push(info);
      }
    }

    Sort.sortBy(infos, (x) => x.name);
    return infos;
  }

  function convertToExecutionStateArray(
    records: Iterable<IOperationExecutionResult>
  ): IOperationExecutionState[] {
    const states: IOperationExecutionState[] = [];
    for (const record of records) {
      const state: IOperationExecutionState | undefined = convertToExecutionState(record);
      if (state) states.push(state);
    }
    Sort.sortBy(states, (x) => x.name);
    return states;
  }

  function sendWebSocketMessage(message: IWebSocketEventMessage): void {
    const stringifiedMessage: string = JSON.stringify(message);
    for (const socket of webSockets) {
      socket.send(stringifiedMessage);
    }
  }

  const { command } = options;
  const sessionInfo: IRushSessionInfo = {
    actionName: command.actionName,
    repositoryIdentifier: getRepositoryIdentifier(options.rushConfiguration)
  };

  let executionManager: IOperationExecutionManager | undefined;
  // Operations that have been queued for an upcoming execution pass (captured at queue time)
  let queuedStates: IOperationExecutionResult[] | undefined;

  function getManagerStateSnapshot(): IWebSocketSyncEventMessage['managerState'] | undefined {
    if (!executionManager) return;
    return {
      parallelism: executionManager.parallelism,
      debugMode: executionManager.debugMode,
      verbose: !executionManager.quietMode,
      runNextPassBehavior: executionManager.runNextPassBehavior,
      status: buildStatus,
      hasQueuedPass: executionManager.hasQueuedPass
    };
  }

  function sendSyncMessage(webSocket: WebSocket): void {
    const records: Set<IOperationExecutionResult> = new Set(operationStates?.values() ?? []);
    const syncMessage: IWebSocketSyncEventMessage = {
      event: 'sync',
      operations: convertToOperationInfoArray(executionManager?.operations ?? []),
      currentExecutionStates: convertToExecutionStateArray(records),
      queuedStates: queuedStates ? convertToExecutionStateArray(queuedStates) : undefined,
      sessionInfo,
      status: buildStatus,
      managerState: getManagerStateSnapshot() ?? {
        parallelism: 1,
        debugMode: false,
        verbose: true,
        runNextPassBehavior: 'automatic',
        status: buildStatus,
        hasQueuedPass: false
      },
      lastExecutionResults: executionManager
        ? convertToExecutionStateArray(executionManager.lastExecutionResults.values())
        : undefined
    };
    webSocket.send(JSON.stringify(syncMessage));
  }

  command.hooks.executionManagerAsync.tap(PLUGIN_NAME, (manager, context) => {
    executionManager = manager;
    const { hooks } = manager;

    manager.addTerminalDestination(new WebSocketTerminalWritable(webSockets));

    hooks.beforeExecuteOperationsAsync.tap(
      PLUGIN_NAME,
      (operationsToExecute: ReadonlyMap<Operation, IOperationExecutionResult>): void => {
        // Clear queuedStates when the pass begins executing
        queuedStates = undefined;
        for (const [operation, result] of operationsToExecute) {
          operationStates.set(operation.name, result);
        }

        const beforeExecuteMessage: IWebSocketBeforeExecuteEventMessage = {
          event: 'before-execute',
          executionStates: convertToExecutionStateArray(operationsToExecute.values())
        };
        buildStatus = 'Executing';
        sendWebSocketMessage(beforeExecuteMessage);
      }
    );

    hooks.afterExecuteOperationsAsync.tap(
      PLUGIN_NAME,
      (
        status: OperationStatus,
        operationResults: ReadonlyMap<Operation, IOperationExecutionResult>
      ): OperationStatus => {
        buildStatus = readableStatusFromStatus[status];
        const states: IOperationExecutionState[] = convertToExecutionStateArray(
          operationResults.values() ?? []
        );
        const afterExecuteMessage: IWebSocketAfterExecuteEventMessage = {
          event: 'after-execute',
          executionStates: states,
          status: buildStatus,
          lastExecutionResults: executionManager
            ? convertToExecutionStateArray(executionManager.lastExecutionResults.values())
            : undefined
        };
        sendWebSocketMessage(afterExecuteMessage);
        return status;
      }
    );

    // Batched operation state updates
    hooks.onExecutionStatesUpdated.tap(
      PLUGIN_NAME,
      (records: ReadonlySet<IOperationExecutionResult>): void => {
        const states: IOperationExecutionState[] = convertToExecutionStateArray(records.values());
        const message: IWebSocketBatchStatusChangeEventMessage = {
          event: 'status-change',
          executionStates: states
        };
        sendWebSocketMessage(message);
      }
    );

    // Capture queued operations for next pass
    hooks.onPassQueued.tap(
      PLUGIN_NAME,
      (queuedMap: ReadonlyMap<Operation, IOperationExecutionResult>): void => {
        queuedStates = Array.from(queuedMap.values());
        const message: IWebSocketPassQueuedEventMessage = {
          event: 'pass-queued',
          queuedStates: convertToExecutionStateArray(queuedStates)
        };
        sendWebSocketMessage(message);
      }
    );

    // Broadcast manager state changes
    hooks.onManagerStateChanged.tap(PLUGIN_NAME, () => {
      const managerState: IWebSocketSyncEventMessage['managerState'] | undefined = getManagerStateSnapshot();
      if (managerState) {
        const message: {
          event: 'sync-manager-state';
          managerState: IWebSocketSyncEventMessage['managerState'];
        } = {
          event: 'sync-manager-state',
          managerState
        };
        sendWebSocketMessage(message);
        // Execution state may depend on manager properties, so broadcast states.
      }
    });

    // Broadcast enabled state changes (full operations sync for simplicity)
    // When enable states change, emit a lightweight sync-operations message conveying the static graph changes.
    // The client will preserve existing dynamic state arrays.
    hooks.onEnableStatesChanged.tap(PLUGIN_NAME, () => {
      const operationsMessage: IWebSocketSyncOperationsEventMessage = {
        event: 'sync-operations',
        operations: convertToOperationInfoArray(manager.operations.values())
      };
      sendWebSocketMessage(operationsMessage);
    });
  });

  const connector: WebSocketServerUpgrader = (server: Http2SecureServer) => {
    const wss: WebSocketServer = new WebSocketServer({
      server: server as unknown as HTTPSecureServer,
      path: buildStatusWebSocketPath
    });

    command.sessionAbortController.signal.addEventListener(
      'abort',
      () => {
        wss.close();
        webSockets.forEach((ws) => ws.close());
      },
      { once: true }
    );

    function namesToOperations(operationNames?: string[]): Operation[] | undefined {
      if (!operationNames || !executionManager) {
        return;
      }

      const operationNameSet: Set<string> = new Set(operationNames);
      const namedOperations: Operation[] = [];
      for (const operation of executionManager.operations) {
        if (operationNameSet.has(operation.name)) {
          namedOperations.push(operation);
        }
      }
      return namedOperations;
    }

    wss.addListener('connection', (webSocket: WebSocket): void => {
      webSockets.add(webSocket);

      sendSyncMessage(webSocket); // includes settings

      webSocket.addEventListener('message', (ev: MessageEvent) => {
        const parsedMessage: IWebSocketCommandMessage = JSON.parse(ev.data.toString());
        switch (parsedMessage.command) {
          case 'sync': {
            sendSyncMessage(webSocket);
            break;
          }

          case 'set-enabled-states': {
            if (executionManager) {
              const { operationNames, targetState, mode } = parsedMessage;
              const operations: Operation[] | undefined = namesToOperations(operationNames);
              if (operations && operations.length) {
                executionManager.setEnabledStates(
                  operations,
                  targetState === 'ignore-dependency-changes' ? targetState : targetState !== 'never',
                  mode
                );
              }
            }
            break;
          }

          case 'invalidate': {
            const { operationNames } = parsedMessage;
            if (executionManager) {
              const operations: Iterable<Operation> | undefined = namesToOperations(operationNames);
              executionManager.invalidateOperations(operations, 'manual-invalidation');
            }
            break;
          }

          case 'abort-execution': {
            void executionManager?.abortCurrentPassAsync();
            break;
          }

          case 'close-runners': {
            const { operationNames } = parsedMessage;
            if (executionManager) {
              const operations: Operation[] | undefined = namesToOperations(operationNames);
              void executionManager.closeRunnersAsync(operations);
            }
            break;
          }

          case 'execute': {
            if (executionManager) {
              const definedExecutionManager: IOperationExecutionManager = executionManager;
              void definedExecutionManager.queuePassAsync({}).then(() => {
                return definedExecutionManager.executeQueuedPassAsync();
              });
            }
            break;
          }

          case 'set-debug': {
            if (executionManager) executionManager.debugMode = !!parsedMessage.value;
            break;
          }

          case 'set-verbose': {
            if (executionManager) executionManager.quietMode = !parsedMessage.value; // invert
            break;
          }

          case 'set-run-next-pass-behavior': {
            if (
              executionManager &&
              (parsedMessage.value === 'automatic' || parsedMessage.value === 'manual')
            ) {
              executionManager.runNextPassBehavior = parsedMessage.value;
            }
            break;
          }

          case 'set-parallelism': {
            if (executionManager && typeof parsedMessage.parallelism === 'number') {
              executionManager.parallelism = parsedMessage.parallelism;
            }
            break;
          }

          case 'abort-session': {
            command.sessionAbortController.abort();
            break;
          }

          default: {
            // Unknown message. Ignore.
          }
        }
      });

      webSocket.addEventListener(
        'close',
        () => {
          webSockets.delete(webSocket);
        },
        { once: true }
      );
    });
  };

  return connector;
}
