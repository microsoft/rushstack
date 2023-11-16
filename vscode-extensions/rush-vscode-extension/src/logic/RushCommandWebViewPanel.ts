// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import type { IFromExtensionMessage, IRootState } from '@rushstack/rush-vscode-command-webview';

export class RushCommandWebViewPanel {
  private static _instance: RushCommandWebViewPanel | undefined;
  private _panel: vscode.WebviewView | undefined;
  private _webViewProvider: vscode.WebviewViewProvider | undefined;
  private _context: vscode.ExtensionContext;
  private _extensionPath: string;
  private constructor(context: vscode.ExtensionContext) {
    this._extensionPath = context.extensionPath;
    this._context = context;
  }

  public static getInstance(): RushCommandWebViewPanel {
    if (!RushCommandWebViewPanel._instance) {
      throw new Error('Instance has not been initialized!');
    }

    return RushCommandWebViewPanel._instance;
  }

  public static initialize(context: vscode.ExtensionContext): RushCommandWebViewPanel {
    if (RushCommandWebViewPanel._instance) {
      throw new Error('Only one instance of rush command web view panel should be created!');
    }
    RushCommandWebViewPanel._instance = new RushCommandWebViewPanel(context);
    return RushCommandWebViewPanel._instance;
  }

  public postMessage(message: IFromExtensionMessage): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this._panel?.webview.postMessage(message);
  }

  public reveal(): void {
    const state: IRootState = {
      parameter: {
        commandName: '',
        parameters: [],
        argsKV: {},
        searchText: ''
      },
      ui: {
        isToolbarSticky: false,
        currentParameterName: '',
        userSelectedParameterName: ''
      },
      project: {
        projectName: 'test project name',
        projectVersion: '0'
      }
    };

    const resolveWebviewView = (
      thisWebview: vscode.WebviewView,
      thisWebviewContext: vscode.WebviewViewResolveContext,
      thisToken: vscode.CancellationToken
    ): void => {
      this._panel = thisWebview;

      const message: IFromExtensionMessage = {
        command: 'initialize',
        state: state.project
      };
      // eslint-disable-next-line no-console
      console.log('message', message);
      thisWebview.webview.options = { enableScripts: true };
      thisWebview.webview.html = this._getWebviewContent();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      thisWebview.webview.postMessage(message);
    };

    const provider: vscode.WebviewViewProvider = {
      resolveWebviewView
    };
    this._context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('rushProjectDetails', provider)
    );

    //   const state: IRootState = {
    //     parameter: {
    //       commandName: '',
    //       parameters: [],
    //       argsKV: {},
    //       searchText: ''
    //     },
    //     ui: {
    //       isToolbarSticky: false,
    //       currentParameterName: '',
    //       userSelectedParameterName: ''
    //     },
    //     project: {
    //       projectName: 'test project name'
    //     }
    //   };

    // if (!this._panel) {
    //   this._panel = vscode.window.createWebviewPanel(
    //     'rushCommandWebViewPanel',
    //     'Run Rush Command',
    //     vscode.ViewColumn.Active,
    //     {
    //       enableScripts: true,
    //       retainContextWhenHidden: true
    //     }
    //   );
    //   this._panel.onDidDispose(() => {
    //     this._panel = undefined;
    //   });
    //   this._setWebviewContent(state);
    //   this._panel.webview.onDidReceiveMessage((message: IToExtensionMessage) => {
    //     switch (message.command) {
    //       case 'commandInfo': {
    //         // eslint-disable-next-line @typescript-eslint/no-floating-promises
    //         RushTaskProvider.getInstance().executeTask({
    //           type: 'rush-command-line',
    //           displayName: `rush ${message.commandName}`,
    //           cwd: RushWorkspace.getCurrentInstance().workspaceRootPath,
    //           command: message.commandName,
    //           args: message.args
    //         });
    //         break;
    //       }
    //       default: {
    //         const _command: never = message.command;
    //         // eslint-disable-next-line no-console
    //         console.error(`Unknown command: ${_command}`);
    //         break;
    //       }
    //     }
    //   });
    // } else {
    //   const message: IFromExtensionMessage = {
    //     command: 'initialize',
    //     state: {
    //       ...state.parameter,
    //       parameters: state.parameter.parameters
    //     }
    //   };
    //   // eslint-disable-next-line no-console
    //   console.log('message', message);
    //   this._panel.reveal();
    //   // eslint-disable-next-line @typescript-eslint/no-floating-promises
    //   this._panel.webview.postMessage(message);
    // }
  }

  private _setWebviewContent(state: IRootState): void {
    if (!this._panel) {
      return;
    }
    this._panel.webview.html = this._getWebviewContent(state);
  }

  private _getWebviewContent(state: unknown = {}): string {
    // eslint-disable-next-line no-console
    console.log('loading rush command webview html and bundle');
    let html: string = FileSystem.readFile(
      path.join(this._extensionPath, 'webview/rush-command-webview/index.html')
    );
    const scriptSrc: vscode.Uri = this._panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(this._extensionPath, 'webview/rush-command-webview/bundle.js'))
    );

    // replace bundled js with the correct path
    html = html.replace('bundle.js', scriptSrc.toString());

    // hydrate initial state
    html = html.replace('window.__DATA__ = {};', `window.__DATA__ = ${JSON.stringify(state)};`);
    return html;
  }
}
