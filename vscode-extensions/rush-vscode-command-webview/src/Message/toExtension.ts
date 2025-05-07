// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Webview } from 'vscode';
export type IToExtensionMessage = IToExtensionMessageCommandInfo;

interface IToExtensionMessageCommandInfo {
  command: 'commandInfo';
  commandName: string;
  args: string[];
}

const vscode: Webview = window.acquireVsCodeApi();

export const sendMessageToExtension: (message: IToExtensionMessage) => void = (message) => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  vscode.postMessage(message);
};
