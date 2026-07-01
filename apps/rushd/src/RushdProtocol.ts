// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Protocol version. Bump when making breaking changes to message format.
 */
export const RUSHD_PROTOCOL_VERSION: number = 1;

// ─── Client → Daemon Messages ──────────────────────────────────────────────

export interface IBaseMessage {
  type: string;
  requestId?: string;
}

export interface IPingRequest extends IBaseMessage {
  type: 'ping';
}

export interface IBuildRequest extends IBaseMessage {
  type: 'build';
  projects?: string[];
  phases?: string[];
  parameters?: Record<string, unknown>;
}

export interface ICancelRequest extends IBaseMessage {
  type: 'cancel';
}

export interface IStatusRequest extends IBaseMessage {
  type: 'status';
}

export interface IShutdownRequest extends IBaseMessage {
  type: 'shutdown';
}

export type ClientMessage = IPingRequest | IBuildRequest | ICancelRequest | IStatusRequest | IShutdownRequest;

// ─── Daemon → Client Messages ──────────────────────────────────────────────

export interface IPongResponse extends IBaseMessage {
  type: 'pong';
  protocolVersion: number;
  uptime: number;
  activeClients: number;
}

export interface IOutputMessage extends IBaseMessage {
  type: 'output';
  operation: string;
  text: string;
  stream: 'stdout' | 'stderr';
}

export interface IOperationStatusMessage extends IBaseMessage {
  type: 'operationStatus';
  operation: string;
  status: string;
}

export interface IResultMessage extends IBaseMessage {
  type: 'result';
  status: 'success' | 'failure' | 'cancelled';
  duration: number;
  operations: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}

export interface IErrorMessage extends IBaseMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface IDaemonStatusResponse extends IBaseMessage {
  type: 'daemonStatus';
  state: 'idle' | 'executing' | 'shutting-down';
  uptime: number;
  activeClients: number;
  protocolVersion: number;
}

export type DaemonMessage =
  | IPongResponse
  | IOutputMessage
  | IOperationStatusMessage
  | IResultMessage
  | IErrorMessage
  | IDaemonStatusResponse;

// ─── Serialization (NDJSON) ────────────────────────────────────────────────

/**
 * Serialize a message to a newline-delimited JSON string.
 */
export function serializeMessage(message: IBaseMessage): string {
  return JSON.stringify(message) + '\n';
}

/**
 * Parse a buffer of newline-delimited JSON into messages.
 * Returns parsed messages and any remaining incomplete data.
 */
export function parseMessages(data: string): { messages: IBaseMessage[]; remainder: string } {
  const messages: IBaseMessage[] = [];
  const lines: string[] = data.split('\n');
  // Last element may be incomplete (no trailing newline yet)
  const remainder: string = lines.pop() || '';

  for (const line of lines) {
    const trimmed: string = line.trim();
    if (trimmed.length > 0) {
      messages.push(JSON.parse(trimmed));
    }
  }

  return { messages, remainder };
}
