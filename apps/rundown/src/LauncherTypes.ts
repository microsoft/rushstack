// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const enum LauncherAction {
  Snapshot = 'snapshot',
  Inspect = 'inspect'
}

export interface IIpcTraceRecord {
  importedModule: string;
  callingModule: string;
}

export interface IIpcTrace {
  id: 'trace';
  records: IIpcTraceRecord[];
}

export interface IIpcDone {
  id: 'done';
}

export type IpcMessage = IIpcTrace | IIpcDone;
