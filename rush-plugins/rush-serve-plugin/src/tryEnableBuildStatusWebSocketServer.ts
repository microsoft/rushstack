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
  type ICreateOperationsContext,
  type IExecutionResult,
  type RushConfiguration,
  type IExecuteOperationsContext
} from '@rushstack/rush-sdk';

import type {
  ReadableOperationStatus,
  ILogFileURLs,
  IOperationInfo,
  IWebSocketEventMessage,
  IRushSessionInfo,
  IWebSocketSyncEventMessage,
  OperationEnabledState,
  IWebSocketBeforeExecuteEventMessage,
  IWebSocketAfterExecuteEventMessage,
  IWebSocketBatchStatusChangeEventMessage,
  IWebSocketCommandMessage
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
  let executionAbortController: AbortController | undefined;

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
  function convertToOperationInfo(record: IOperationExecutionResult): IOperationInfo | undefined {
    const { operation } = record;
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

      enabled,
      silent: runner.silent,
      noop: !!runner.isNoOp,

      status: readableStatusFromStatus[record.status],
      startTime: record.stopwatch.startTime,
      endTime: record.stopwatch.endTime,

      logFileURLs: convertToLogFileUrls(record.logFilePaths, packageName)
    };
  }

  function convertToOperationInfoArray(records: Iterable<IOperationExecutionResult>): IOperationInfo[] {
    const operations: IOperationInfo[] = [];

    for (const record of records) {
      const info: IOperationInfo | undefined = convertToOperationInfo(record);

      if (info) {
        operations.push(info);
      }
    }

    Sort.sortBy(operations, (x) => x.name);
    return operations;
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

  function sendSyncMessage(webSocket: WebSocket): void {
    const syncMessage: IWebSocketSyncEventMessage = {
      event: 'sync',
      operations: convertToOperationInfoArray(operationStates?.values() ?? []),
      sessionInfo,
      status: buildStatus
    };

    webSocket.send(JSON.stringify(syncMessage));
  }

  const { hooks } = command;

  let invalidateOperation: ((operation: Operation, reason: string) => void) | undefined;

  const operationEnabledStates: Map<string, OperationEnabledState> = new Map();
  hooks.createOperations.tap(
    {
      name: PLUGIN_NAME,
      stage: Infinity
    },
    (operations: Set<Operation>, context: ICreateOperationsContext) => {
      const potentiallyAffectedOperations: Set<Operation> = new Set();
      for (const operation of operations) {
        const { associatedProject } = operation;
        if (context.projectsInUnknownState.has(associatedProject)) {
          potentiallyAffectedOperations.add(operation);
        }
      }
      for (const operation of potentiallyAffectedOperations) {
        for (const consumer of operation.consumers) {
          potentiallyAffectedOperations.add(consumer);
        }

        const { name } = operation;
        const expectedState: OperationEnabledState | undefined = operationEnabledStates.get(name);
        switch (expectedState) {
          case 'affected':
            operation.enabled = true;
            break;
          case 'never':
            operation.enabled = false;
            break;
          case 'changed':
            operation.enabled = context.projectsInUnknownState.has(operation.associatedProject);
            break;
          case 'default':
          case undefined:
            // Use the original value.
            break;
        }
      }

      invalidateOperation = context.invalidateOperation;

      return operations;
    }
  );

  hooks.beforeExecuteOperations.tap(
    PLUGIN_NAME,
    (
      operationsToExecute: Map<Operation, IOperationExecutionResult>,
      context: IExecuteOperationsContext
    ): void => {
      for (const [operation, result] of operationsToExecute) {
        operationStates.set(operation.name, result);
      }

      executionAbortController = context.abortController;

      const beforeExecuteMessage: IWebSocketBeforeExecuteEventMessage = {
        event: 'before-execute',
        operations: convertToOperationInfoArray(operationsToExecute.values())
      };
      buildStatus = 'Executing';
      sendWebSocketMessage(beforeExecuteMessage);
    }
  );

  hooks.afterExecuteOperations.tap(PLUGIN_NAME, (result: IExecutionResult): void => {
    buildStatus = readableStatusFromStatus[result.status];
    const infos: IOperationInfo[] = convertToOperationInfoArray(result.operationResults.values() ?? []);
    const afterExecuteMessage: IWebSocketAfterExecuteEventMessage = {
      event: 'after-execute',
      operations: infos,
      status: buildStatus
    };
    sendWebSocketMessage(afterExecuteMessage);
  });

  const pendingStatusChanges: Map<Operation, IOperationExecutionResult> = new Map();
  let statusChangeTimeout: NodeJS.Immediate | undefined;
  function sendBatchedStatusChange(): void {
    statusChangeTimeout = undefined;
    const infos: IOperationInfo[] = convertToOperationInfoArray(pendingStatusChanges.values());
    pendingStatusChanges.clear();
    const message: IWebSocketBatchStatusChangeEventMessage = {
      event: 'status-change',
      operations: infos
    };
    sendWebSocketMessage(message);
  }

  hooks.onOperationStatusChanged.tap(PLUGIN_NAME, (record: IOperationExecutionResult): void => {
    pendingStatusChanges.set(record.operation, record);
    if (!statusChangeTimeout) {
      statusChangeTimeout = setImmediate(sendBatchedStatusChange);
    }
  });

  const connector: WebSocketServerUpgrader = (server: Http2SecureServer) => {
    const wss: WebSocketServer = new WebSocketServer({
      server: server as unknown as HTTPSecureServer,
      path: buildStatusWebSocketPath
    });
    wss.addListener('connection', (webSocket: WebSocket): void => {
      webSockets.add(webSocket);

      sendSyncMessage(webSocket);

      webSocket.addEventListener('message', (ev: MessageEvent) => {
        const parsedMessage: IWebSocketCommandMessage = JSON.parse(ev.data.toString());
        switch (parsedMessage.command) {
          case 'sync': {
            sendSyncMessage(webSocket);
            break;
          }

          case 'set-enabled-states': {
            const { enabledStateByOperationName } = parsedMessage;
            for (const [name, state] of Object.entries(enabledStateByOperationName)) {
              operationEnabledStates.set(name, state);
            }
            break;
          }

          case 'invalidate': {
            const { operationNames } = parsedMessage;
            const operationNameSet: Set<string> = new Set(operationNames);
            if (invalidateOperation) {
              for (const operationName of operationNameSet) {
                const operationState: IOperationExecutionResult | undefined =
                  operationStates.get(operationName);
                if (operationState) {
                  invalidateOperation(operationState.operation, 'Invalidated via WebSocket');
                  operationStates.delete(operationName);
                }
              }
            }
            break;
          }

          case 'abort-execution': {
            executionAbortController?.abort();
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
