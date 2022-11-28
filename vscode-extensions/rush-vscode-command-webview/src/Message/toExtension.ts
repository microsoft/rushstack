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
