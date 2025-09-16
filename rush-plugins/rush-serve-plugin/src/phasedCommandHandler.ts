// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import type { Server as HTTPSecureServer } from 'node:https';
import http2, { type Http2SecureServer } from 'node:http2';
import type { AddressInfo } from 'node:net';
import os from 'node:os';

import express, { type Application } from 'express';
import http2express from 'http2-express-bridge';
import cors from 'cors';
import compression from 'compression';
import { WebSocketServer, type WebSocket, type MessageEvent } from 'ws';

import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { AlreadyReportedError, Sort } from '@rushstack/node-core-library';
import {
  type ILogger,
  type RushConfiguration,
  type RushConfigurationProject,
  type RushSession,
  type IPhasedCommand,
  type Operation,
  type ICreateOperationsContext,
  type IOperationExecutionResult,
  OperationStatus,
  type IExecutionResult,
  type ILogFilePaths,
  RushConstants
} from '@rushstack/rush-sdk';
import { getProjectLogFolders } from '@rushstack/rush-sdk/lib/logic/operations/ProjectLogWritable';
import { type CommandLineIntegerParameter, CommandLineParameterKind } from '@rushstack/ts-command-line';

import { PLUGIN_NAME } from './constants';
import { type IRoutingRule, RushServeConfiguration } from './RushProjectServeConfigFile';

import type {
  IOperationInfo,
  IWebSocketAfterExecuteEventMessage,
  IWebSocketBeforeExecuteEventMessage,
  IWebSocketEventMessage,
  IWebSocketBatchStatusChangeEventMessage,
  IWebSocketSyncEventMessage,
  ReadableOperationStatus,
  IWebSocketCommandMessage,
  IRushSessionInfo,
  ILogFileURLs,
  OperationEnabledState
} from './api.types';

export interface IPhasedCommandHandlerOptions {
  rushSession: RushSession;
  rushConfiguration: RushConfiguration;
  command: IPhasedCommand;
  portParameterLongName: string | undefined;
  logServePath: string | undefined;
  globalRoutingRules: IRoutingRule[];
  buildStatusWebSocketPath: string | undefined;
}

export async function phasedCommandHandler(options: IPhasedCommandHandlerOptions): Promise<void> {
  const { rushSession, command, portParameterLongName, globalRoutingRules } = options;

  const logger: ILogger = rushSession.getLogger(PLUGIN_NAME);

  let activePort: number | undefined;
  // The DNS name by which this server can be accessed.
  // Defaults to 'localhost' but depends on the certificate
  let activeHostNames: readonly string[] = ['localhost'];

  function logHost(): void {
    if (activePort !== undefined) {
      logger.terminal.writeLine(
        `Content is being served from:\n  ${activeHostNames
          .map((hostName) => `https://${hostName}:${activePort}/`)
          .join('\n  ')}`
      );
    }
  }

  const webSocketServerUpgrader: WebSocketServerUpgrader | undefined =
    tryEnableBuildStatusWebSocketServer(options);

  command.hooks.createOperations.tapPromise(
    {
      name: PLUGIN_NAME,
      stage: -1
    },
    async (operations: Set<Operation>, context: ICreateOperationsContext) => {
      if (!context.isInitial || !context.isWatch) {
        return operations;
      }

      const certManager: CertificateManager = new CertificateManager();

      const certificate: ICertificate = await certManager.ensureCertificateAsync(
        true, // Allow generating a new certificate
        logger.terminal
      );

      const { customParameters } = context;

      let requestedPort: number = 0;

      // If command-line.json has an existing parameter for specifying a port, use it
      const portParameter: CommandLineIntegerParameter | undefined = portParameterLongName
        ? (customParameters.get(portParameterLongName) as CommandLineIntegerParameter)
        : undefined;
      if (portParameter) {
        if (portParameter.kind !== CommandLineParameterKind.Integer) {
          throw new Error(`The "${portParameterLongName}" parameter must be an integer parameter`);
        }

        requestedPort = portParameter.value ?? 0;
      } else if (portParameterLongName) {
        logger.terminal.writeErrorLine(
          `Custom parameter "${portParameterLongName}" is not defined for command "${command.actionName}" ` +
            `in "${RushConstants.commandLineFilename}".`
        );
        throw new AlreadyReportedError();
      }

      const app: Application & { http2Request?: object; http2Response?: object } = http2express(express);

      if (app.http2Response) {
        // Hack to allow the compression middleware to be used with http2-express-bridge
        Object.defineProperty(Object.getPrototypeOf(app.http2Response), '_header', {
          get: function () {
            return this.headersSent;
          }
        });

        Object.defineProperty(Object.getPrototypeOf(app.http2Response), '_implicitHeader', {
          value: function () {
            return this.writeHead(this.statusCode);
          }
        });
      }

      app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Allow access from other devices on the same network
        next();
      });

      app.options(
        '*',
        cors({
          // No options needed
        })
      );

      app.use(compression({}));

      const selectedProjects: ReadonlySet<RushConfigurationProject> = context.projectSelection;

      const serveConfig: RushServeConfiguration = new RushServeConfiguration();

      const routingRules: IRoutingRule[] = await serveConfig.loadProjectConfigsAsync(
        selectedProjects,
        logger.terminal,
        globalRoutingRules
      );

      const { logServePath } = options;
      if (logServePath) {
        for (const project of selectedProjects) {
          const projectLogServePath: string = getLogServePathForProject(logServePath, project.packageName);

          routingRules.push({
            type: 'folder',
            diskPath: getProjectLogFolders(project.projectFolder).textFolder,
            servePath: projectLogServePath,
            immutable: false
          });

          routingRules.push({
            type: 'folder',
            diskPath: getProjectLogFolders(project.projectFolder).jsonlFolder,
            servePath: projectLogServePath,
            immutable: false
          });
        }
      }

      const fileRoutingRules: Map<string, IRoutingRule> = new Map();

      const wbnRegex: RegExp = /\.wbn$/i;
      function setHeaders(response: express.Response, path?: string, stat?: unknown): void {
        response.set('Access-Control-Allow-Origin', '*');
        response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

        // TODO: Generalize headers and MIME types with an external database or JSON file.
        if (path && wbnRegex.test(path)) {
          response.set('X-Content-Type-Options', 'nosniff');
          response.set('Content-Type', 'application/webbundle');
        }
      }

      for (const rule of routingRules) {
        const { diskPath, servePath } = rule;
        if (rule.type === 'file') {
          const existingRule: IRoutingRule | undefined = fileRoutingRules.get(servePath);
          if (existingRule) {
            throw new Error(
              `Request to serve "${diskPath}" at "${servePath}" conflicts with existing rule to serve "${existingRule.diskPath}" from this location.`
            );
          } else {
            fileRoutingRules.set(diskPath, rule);
            app.get(servePath, (request: express.Request, response: express.Response) => {
              response.sendFile(diskPath, {
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, OPTIONS'
                }
              });
            });
          }
        } else {
          app.use(
            servePath,
            express.static(diskPath, {
              dotfiles: 'ignore',
              immutable: rule.immutable,
              index: false,
              redirect: false,
              setHeaders
            })
          );
        }
      }

      const server: http2.Http2SecureServer = http2.createSecureServer(
        {
          ca: certificate.pemCaCertificate,
          cert: certificate.pemCertificate,
          key: certificate.pemKey,
          allowHTTP1: true
        },
        app
      );

      webSocketServerUpgrader?.(server);

      server.listen(requestedPort);
      command.abortController.signal.addEventListener(
        'abort',
        () => {
          server.close();
          // Don't let the HTTP/2 server keep the process alive if the user asks to quit.
          server.unref();
        },
        { once: true }
      );
      await once(server, 'listening');

      const address: AddressInfo | undefined = server.address() as AddressInfo;
      activePort = address?.port;

      if (certificate.subjectAltNames) {
        activeHostNames = certificate.subjectAltNames;
      }

      if (portParameter) {
        // Hack the value of the parsed command line parameter to the actual runtime value.
        // This will cause the resolved value to be forwarded to operations that may use it.
        (portParameter as unknown as { _value?: string })._value = `${activePort}`;
      }

      return operations;
    }
  );

  command.hooks.waitingForChanges.tap(PLUGIN_NAME, logHost);
}

type WebSocketServerUpgrader = (server: Http2SecureServer) => void;

/**
 *
 */
function tryEnableBuildStatusWebSocketServer(
  options: IPhasedCommandHandlerOptions
): WebSocketServerUpgrader | undefined {
  const { buildStatusWebSocketPath } = options;
  if (!buildStatusWebSocketPath) {
    return;
  }

  let operationStates: Map<Operation, IOperationExecutionResult> | undefined;
  let buildStatus: ReadableOperationStatus = 'Ready';

  const webSockets: Set<WebSocket> = new Set();

  // Map from OperationStatus enum values back to the names of the constants
  const readableStatusFromStatus: { [K in OperationStatus]: ReadableOperationStatus } = {
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
      packageName,
      phaseName: associatedPhase.name,

      enabled,
      silent: record.silent,
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
    (operationsToExecute: Map<Operation, IOperationExecutionResult>): void => {
      operationStates = operationsToExecute;

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
            if (invalidateOperation && operationStates) {
              for (const operation of operationStates.keys()) {
                if (operationNameSet.has(operation.name)) {
                  invalidateOperation(operation, 'WebSocket');
                }
              }
            }
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

function getRepositoryIdentifier(rushConfiguration: RushConfiguration): string {
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

function getLogServePathForProject(logServePath: string, packageName: string): string {
  return `${logServePath}/${packageName}`;
}
