// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import type { IFromExtensionMessage, IRootState } from '@rushstack/rush-vscode-command-webview';

let _instance: RushCommandWebViewPanel | undefined;

export class RushCommandWebViewPanel {
  #panel: vscode.WebviewView | undefined;
  #webViewProvider: vscode.WebviewViewProvider | undefined;
  #context: vscode.ExtensionContext;
  #extensionPath: string;
  private constructor(context: vscode.ExtensionContext) {
    this.#extensionPath = context.extensionPath;
    this.#context = context;
  }

  public static getInstance(): RushCommandWebViewPanel {
    if (!_instance) {
      throw new Error('Instance has not been initialized!');
    }

    return _instance;
  }

  public static initialize(context: vscode.ExtensionContext): RushCommandWebViewPanel {
    if (_instance) {
      throw new Error('Only one instance of rush command web view panel should be created!');
    }
    _instance = new RushCommandWebViewPanel(context);
    return _instance;
  }

  public postMessage(message: IFromExtensionMessage): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#panel?.webview.postMessage(message);
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
      this.#panel = thisWebview;

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
    this.#context.subscriptions.push(
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
    if (!this.#panel) {
      return;
    }
    this.#panel.webview.html = this._getWebviewContent(state);
  }

  private _getWebviewContent(state: unknown = {}): string {
    // eslint-disable-next-line no-console
    console.log('loading rush command webview html and bundle');
    let html: string = FileSystem.readFile(
      path.join(this.#extensionPath, 'webview/rush-command-webview/index.html')
    );
    const scriptSrc: vscode.Uri = this.#panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.#extensionPath, 'webview/rush-command-webview/bundle.js'))
    );

    // replace bundled js with the correct path
    html = html.replace('bundle.js', scriptSrc.toString());

    // hydrate initial state
    html = html.replace('window.__DATA__ = {};', `window.__DATA__ = ${JSON.stringify(state)};`);
    return html;
  }
}
