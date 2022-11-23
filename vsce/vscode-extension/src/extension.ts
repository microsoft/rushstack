// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LogLevel, setLogLevel, terminal } from './logic/logger';
import { RushWorkspace } from './logic/RushWorkspace';
import { RushCommandsProvider } from './providers/RushCommandsProvider';
import { RushProjectsProvider } from './providers/RushProjectsProvider';
import { RushTaskProvider } from './providers/TaskProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('rushstack.selectWorkspace', async () => {
      await RushWorkspace.selectWorkspace();
    })
  );

  const extensionConfiguration: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration('rushstack');

  terminal.writeLine(`Extension configuration: ${JSON.stringify(extensionConfiguration)}`);

  const extensionLogLevel: LogLevel | undefined = extensionConfiguration.get('logLevel');
  if (extensionLogLevel) {
    setLogLevel(extensionLogLevel);
  }

  const workspaceFolderPaths: string[] = vscode.workspace.workspaceFolders?.map((x) => x.uri.fsPath) || [];
  const rushWorkspace: RushWorkspace | undefined =
    RushWorkspace.initializeFromWorkspaceFolderPaths(workspaceFolderPaths);
  if (rushWorkspace) {
    // Projects Tree View
    vscode.window.createTreeView('rushProjects', {
      treeDataProvider: new RushProjectsProvider(context)
    });
    vscode.tasks.registerTaskProvider('rushstack', RushTaskProvider.getInstance());

    // Rush Commands TreeView
    vscode.window.createTreeView('rushCommands', {
      treeDataProvider: new RushCommandsProvider(context)
    });
  }
}

// this method is called when your extension is deactivated
export function deactivate(): void {}
