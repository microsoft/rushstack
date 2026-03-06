// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { terminal } from '../logic/logger.ts';
import { RushWorkspace } from '../logic/RushWorkspace.ts';

import type { CommandLineAction } from '@rushstack/rush-vscode-command-webview';

interface IRushCommandParams {
  label: string;
  collapsibleState: vscode.TreeItemCollapsibleState;
  commandLineAction: CommandLineAction;
}

class RushCommand extends vscode.TreeItem {
  // public readonly commandLineAction: CommandLineAction;
  public constructor({ label, collapsibleState, commandLineAction }: IRushCommandParams) {
    super(label, collapsibleState);
    this.contextValue = 'rushCommand';
    // this.commandLineAction = commandLineAction;
    this.command = {
      title: 'Run Rush Command',
      command: 'rushstack.rushCommands.runRushCommand',
      arguments: [this]
    };
  }
}

export class RushCommandsProvider implements vscode.TreeDataProvider<RushCommand> {
  private _context: vscode.ExtensionContext;
  private _commandLineActions: CommandLineAction[] | undefined;
  private readonly _onDidChangeTreeData: vscode.EventEmitter<RushCommand | undefined> =
    new vscode.EventEmitter();

  public readonly onDidChangeTreeData: vscode.Event<RushCommand | undefined> =
    this._onDidChangeTreeData.event;

  public constructor(context: vscode.ExtensionContext) {
    this._context = context;
    const rushWorkspace: RushWorkspace = RushWorkspace.getCurrentInstance();
    RushWorkspace.onDidChangeWorkspace((newWorkspace: RushWorkspace) => {
      this._commandLineActions = newWorkspace.commandLineActions;
      this.refresh();
    });
    this._commandLineActions = rushWorkspace.commandLineActions;

    const commandNames: readonly ['openParameterViewPanel', 'runRushCommand'] = [
      'openParameterViewPanel',
      'runRushCommand'
    ] as const;

    for (const commandName of commandNames) {
      const handler:
        | (() => Promise<void>)
        | ((element?: RushCommand) => Promise<void>)
        | ((element: RushCommand) => Promise<void>) = this[`${commandName}Async`];
      context.subscriptions.push(
        vscode.commands.registerCommand(`rushstack.rushCommands.${commandName}`, handler, this)
      );
    }
  }

  public refresh(): void {
    terminal.writeDebugLine('Refreshing Rush commands');
    this._onDidChangeTreeData.fire(undefined);
  }

  public async refreshEntryAsync(): Promise<void> {
    this.refresh();
  }

  public async openParameterViewPanelAsync(): Promise<void> {
    // return RushCommandWebViewPanel.getInstance(this._context).reveal('');
  }

  public async runRushCommandAsync(element?: RushCommand): Promise<void> {
    // const rushCommand: RushCommand | undefined = element;
    await this.openParameterViewPanelAsync();
    // if (!rushCommand) {
    //   const actionNames: string[] = this._commandLineActions?.map((action) => action.actionName) || [];
    //   if (!actionNames.length) {
    //     terminal.writeErrorLine('No Rush commands available');
    //     return;
    //   }
    //   const commandSelect: string | undefined = await vscode.window.showQuickPick(actionNames, {
    //     placeHolder: 'Select a Rush command to run',
    //     onDidSelectItem: (item) => {
    //       const foundAction: CommandLineAction | undefined = this._commandLineActions?.find(
    //         (action) => action.actionName === item
    //       );
    //       if (foundAction) {
    //         rushCommand = new RushCommand({
    //           label: foundAction.actionName,
    //           collapsibleState: vscode.TreeItemCollapsibleState.None,
    //           commandLineAction: foundAction
    //         });
    //       }
    //     }
    //   });
    //   terminal.writeDebugLine(`Selected command: ${commandSelect}`);
    // }

    // if (!rushCommand) {
    //   return;
    // }
    // terminal.writeDebugLine(`Running command: ${rushCommand.label}`);
    // await this.openParameterViewPanelAsync(rushCommand);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  public getChildren(element?: vscode.TreeItem): Thenable<RushCommand[]> {
    // eslint-disable-next-line no-console
    console.log('children: ', this._commandLineActions);
    // eslint-disable-next-line no-console
    console.log('element: ', element);
    if (!this._commandLineActions) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      vscode.window.showInformationMessage('No RushProjects in empty workspace');
      return Promise.resolve([]);
    }

    return Promise.resolve([
      {
        label: 'Test label',
        collapsibleState: vscode.TreeItemCollapsibleState.None
      },
      {
        label: 'Test label2',
        collapsibleState: vscode.TreeItemCollapsibleState.None
      },
      {
        label: 'Test label3',
        collapsibleState: vscode.TreeItemCollapsibleState.None
      }
    ]);

    // top-level
    // if (!element) {
    //   return Promise.resolve(
    //     this._commandLineActions.map(
    //       (commandLineAction) =>
    //         new RushCommand({
    //           label: commandLineAction.actionName,
    //           collapsibleState: vscode.TreeItemCollapsibleState.None,
    //           commandLineAction
    //         })
    //     )
    //   );
    // }

    // return Promise.resolve([]);
  }
}
