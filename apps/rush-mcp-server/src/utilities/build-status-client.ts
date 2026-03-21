// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import WebSocket from 'ws';

/**
 * URLs for an operation's log files, served by the rush-serve-plugin.
 */
export interface ILogFileURLs {
  text: string;
  error: string;
  jsonl: string;
}

/**
 * Minimal subset of operation info from the rush-serve-plugin WebSocket protocol.
 */
export interface IOperationSummary {
  name: string;
  packageName: string;
  phaseName: string;
  status: string;
  startTime: number | undefined;
  endTime: number | undefined;
  logFileURLs: ILogFileURLs | undefined;
}

/**
 * Session information from the rush-serve-plugin WebSocket protocol.
 */
export interface IRushSessionInfo {
  actionName: string;
  repositoryIdentifier: string;
}

/**
 * A snapshot of the current build status, returned by the WebSocket utility functions.
 */
export interface IBuildStatusSnapshot {
  status: string;
  operations: IOperationSummary[];
  sessionInfo?: IRushSessionInfo;
}

/**
 * Options for connecting to the rush-serve-plugin WebSocket server.
 */
export interface IBuildStatusClientOptions {
  port: number;
  host?: string;
}

/**
 * WebSocket event message types matching the rush-serve-plugin wire format.
 * Duplicated here to avoid a runtime dependency on rush-serve-plugin.
 */
interface IWebSocketSyncEventMessage {
  event: 'sync';
  operations: IOperationSummary[];
  sessionInfo: IRushSessionInfo;
  status: string;
}

type IWebSocketEventMessage =
  | IWebSocketSyncEventMessage
  | { event: 'before-execute' | 'status-change' | 'after-execute'; operations: IOperationSummary[] };

function buildWebSocketUrl(options: IBuildStatusClientOptions): string {
  const host: string = options.host ?? '127.0.0.1';
  return `wss://${host}:${options.port}/ws`;
}

function toSnapshot(message: IWebSocketSyncEventMessage): IBuildStatusSnapshot {
  return {
    status: message.status,
    operations: message.operations,
    sessionInfo: message.sessionInfo
  };
}

/**
 * Formats a build status snapshot into a human-readable string for LLM consumption.
 */
export function formatBuildStatusSnapshot(snapshot: IBuildStatusSnapshot): string {
  const lines: string[] = [];

  lines.push(`Build Status: ${snapshot.status}`);

  if (snapshot.sessionInfo) {
    lines.push(`Command: ${snapshot.sessionInfo.actionName}`);
    lines.push(`Repository: ${snapshot.sessionInfo.repositoryIdentifier}`);
  }

  // Summarize operation statuses
  const statusCounts: Map<string, number> = new Map();
  for (const op of snapshot.operations) {
    statusCounts.set(op.status, (statusCounts.get(op.status) ?? 0) + 1);
  }

  lines.push('');
  const total: number = snapshot.operations.length;
  const summaryParts: string[] = [];
  for (const [status, count] of statusCounts) {
    summaryParts.push(`${status}: ${count}`);
  }
  lines.push(`Operation Summary: ${total} total`);
  if (summaryParts.length > 0) {
    lines.push(`  ${summaryParts.join(', ')}`);
  }

  // List failed operations
  const failedOps: IOperationSummary[] = snapshot.operations.filter((op) => op.status === 'Failure');
  if (failedOps.length > 0) {
    lines.push('');
    lines.push('Failed Operations:');
    for (const op of failedOps) {
      lines.push(`  - ${op.packageName} (${op.phaseName})`);
    }
  }

  // List blocked operations
  const blockedOps: IOperationSummary[] = snapshot.operations.filter((op) => op.status === 'Blocked');
  if (blockedOps.length > 0) {
    lines.push('');
    lines.push('Blocked Operations:');
    for (const op of blockedOps) {
      lines.push(`  - ${op.packageName} (${op.phaseName})`);
    }
  }

  return lines.join('\n');
}

/**
 * Connects to the rush-serve-plugin WebSocket, receives the initial sync message,
 * and returns a snapshot of the current build status.
 */
export async function fetchBuildStatusAsync(
  options: IBuildStatusClientOptions
): Promise<IBuildStatusSnapshot> {
  const url: string = buildWebSocketUrl(options);

  return new Promise<IBuildStatusSnapshot>((resolve, reject) => {
    const ws: WebSocket = new WebSocket(url, { rejectUnauthorized: false });
    let settled: boolean = false;

    function settle(action: () => void): void {
      if (!settled) {
        settled = true;
        clearTimeout(connectionTimeout);
        action();
      }
    }

    const connectionTimeout: NodeJS.Timeout = setTimeout(() => {
      ws.close();
      settle(() => reject(new Error(`Connection to rush start timed out after 10000ms.`)));
    }, 10000);

    ws.on('error', (err: Error) => {
      settle(() =>
        reject(
          new Error(
            `Cannot connect to rush start on port ${options.port}. Ensure \`rush start\` is running. (${err.message})`
          )
        )
      );
    });

    ws.on('close', () => {
      settle(() =>
        reject(
          new Error(`Connection to rush start on port ${options.port} closed before receiving build status.`)
        )
      );
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message: IWebSocketEventMessage = JSON.parse(data.toString());
        if (message.event === 'sync') {
          settle(() => resolve(toSnapshot(message)));
          ws.close();
        }
      } catch (parseError: unknown) {
        ws.close();
        settle(() => reject(new Error(`Failed to parse WebSocket message: ${parseError}`)));
      }
    });
  });
}
