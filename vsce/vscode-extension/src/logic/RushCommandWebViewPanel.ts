import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { RushTaskProvider } from '../providers/TaskProvider';
import { RushWorkspace } from './RushWorkspace';

import type {
  CommandLineAction,
  CommandLineParameter,
  IFromExtensionMessage,
  IRootState,
  ICommandLineParameter,
  IToExtensionMessage
} from '@rushstack/vsce-rush-command-webview';

export class RushCommandWebViewPanel {
  private static _instance: RushCommandWebViewPanel | undefined;
  private _panel: vscode.WebviewPanel | undefined;
  private _extensionPath: string;
  private constructor(context: vscode.ExtensionContext) {
    this._extensionPath = context.extensionPath;
  }

  public static getInstance(context: vscode.ExtensionContext): RushCommandWebViewPanel {
    if (!RushCommandWebViewPanel._instance) {
      RushCommandWebViewPanel._instance = new RushCommandWebViewPanel(context);
    }

    return RushCommandWebViewPanel._instance;
  }

  public reveal(commandLineAction: CommandLineAction): void {
    const parameters: ICommandLineParameter[] = commandLineAction.parameters
      .slice()
      .map((parameter: CommandLineParameter) => {
        const o: ICommandLineParameter = {
          ...parameter,
          // kind is a getter in CommandLineParameter
          kind: parameter.kind
        };
        return o;
      });
    const state: IRootState = {
      parameter: {
        commandName: commandLineAction.actionName,
        parameters,
        argsKV: {},
        searchText: ''
      },
      ui: {
        isToolbarSticky: false,
        currentParameterName: parameters[0]?.longName || '',
        userSelectedParameterName: ''
      }
    };
    if (!this._panel) {
      this._panel = vscode.window.createWebviewPanel(
        'rushCommandWebViewPanel',
        'Run Rush Command',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });
      this._setWebviewContent(state);
      this._panel.webview.onDidReceiveMessage((message: IToExtensionMessage) => {
        switch (message.command) {
          case 'commandInfo': {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            RushTaskProvider.getInstance().executeTask({
              type: 'rush-command-line',
              displayName: `rush ${message.commandName}`,
              cwd: RushWorkspace.getCurrentInstance().workspaceRootPath,
              command: message.commandName,
              args: message.args
            });
            break;
          }
          default: {
            const _command: never = message.command;
            console.error(`Unknown command: ${_command}`);
            break;
          }
        }
      });
    } else {
      const message: IFromExtensionMessage = {
        command: 'initialize',
        state: {
          ...state.parameter,
          parameters: state.parameter.parameters
        }
      };
      console.log('message', message);
      this._panel.reveal();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._panel.webview.postMessage(message);
    }
  }

  private _setWebviewContent(state: IRootState): void {
    if (!this._panel) {
      return;
    }
    this._panel.webview.html = this._getWebviewContent(state);
  }

  private _getWebviewContent(state: IRootState): string {
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
