// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as Rush from '@rushstack/rush-sdk';
import * as RushLib from '@microsoft/rush-lib';
import * as vscode from 'vscode';
import {
  ProjectDataProvider,
  Project,
  StateGroup,
  OperationPhase
} from './dataProviders/projects/ProjectDataProvider';
import * as path from 'path';
import { Command, CommandDataProvider } from './dataProviders/commands/CommandDataProvider';

declare const global: NodeJS.Global &
  typeof globalThis & {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ___rush___workingDirectory?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ___rush___rushLibModule?: typeof RushLib;
  };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  let isWatching = false;
  let worker: Rush.IPhasedCommandWorkerController | undefined;

  vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');

  const useWorkspaceRushVersion =
    vscode.workspace.getConfiguration().get<boolean>('rush.useWorkspaceRushVersion') ?? true;

  const loadRush = async (): Promise<typeof Rush> => {
    if (useWorkspaceRushVersion) {
      global.___rush___workingDirectory = workspaceRoot;
    } else {
      global.___rush___rushLibModule = await import('@microsoft/rush-lib');
    }

    return await import('@rushstack/rush-sdk');
  };

  const projectDataProvider = new ProjectDataProvider(workspaceRoot, loadRush);

  const projectView = vscode.window.createTreeView('rushProjects', {
    treeDataProvider: projectDataProvider,
    canSelectMany: true,
    showCollapseAll: true
  });

  context.subscriptions.push(projectView);

  const commandProvider = new CommandDataProvider(workspaceRoot, loadRush);

  const commandView = vscode.window.createTreeView('rushCommands', {
    treeDataProvider: commandProvider,
    canSelectMany: false,
    showCollapseAll: false
  });

  context.subscriptions.push(commandView);

  const openProjectCommand = vscode.commands.registerCommand(
    'rush.revealProjectInExplorer',
    (project: Project | StateGroup | OperationPhase) => {
      if (project instanceof Project) {
        vscode.commands.executeCommand(
          'revealInExplorer',
          vscode.Uri.file(path.join(project.rushProject.projectFolder, 'package.json'))
        );
      }
    }
  );

  context.subscriptions.push(openProjectCommand);

  const refreshCommand = vscode.commands.registerCommand('rush.refreshProjects', async () => {
    await projectDataProvider.refresh();
  });

  context.subscriptions.push(refreshCommand);

  const activateProjectCommand = vscode.commands.registerCommand(
    'rush.activateProject',
    async (
      contextProject: Project | StateGroup | OperationPhase,
      selectedProjects: (Project | StateGroup | OperationPhase)[] = [contextProject]
    ) => {
      if (contextProject instanceof Project) {
        await projectDataProvider.toggleActiveProjects(selectedProjects as Project[], true);
      } else if (contextProject instanceof StateGroup) {
        if (contextProject.groupName === 'Included' || contextProject.groupName === 'Excluded') {
          await projectDataProvider.toggleActiveProjects(Array.from(contextProject.projects), true);
        }
      }
    }
  );

  context.subscriptions.push(activateProjectCommand);

  const deactivateProjectCommand = vscode.commands.registerCommand(
    'rush.deactivateProject',
    async (
      contextProject: Project | StateGroup | OperationPhase,
      selectedProjects: (Project | StateGroup | OperationPhase)[] = [contextProject]
    ) => {
      if (contextProject instanceof Project) {
        await projectDataProvider.toggleActiveProjects(selectedProjects as Project[], false);
      } else if (contextProject instanceof StateGroup) {
        if (contextProject.groupName === 'Active') {
          await projectDataProvider.toggleActiveProjects(Array.from(contextProject.projects), false);
        }
      }
    }
  );

  context.subscriptions.push(deactivateProjectCommand);

  const enableWatchCommand = vscode.commands.registerCommand('rush.enableWatch', async () => {
    isWatching = true;

    vscode.window.showInformationMessage('Initializing the Rush watcher.');
    vscode.commands.executeCommand('setContext', 'rush.watcher', 'starting');

    const rush = await loadRush();

    worker = rush.createPhasedCommandWorker(['build'], {
      cwd: workspaceRoot
    });

    try {
      await worker.readyAsync();

      vscode.window.showInformationMessage('Initialized the Rush watcher.');
      vscode.commands.executeCommand('setContext', 'rush.watcher', 'ready');
    } catch {
      vscode.window.showErrorMessage('Failed to initialize the Rush watcher.');
      vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');
    }
  });

  context.subscriptions.push(enableWatchCommand);

  const disableWatchCommand = vscode.commands.registerCommand('rush.disableWatch', async () => {
    if (worker) {
      vscode.window.showInformationMessage('Shutting down the Rush watcher.');
      try {
        await worker.shutdownAsync();
        vscode.window.showInformationMessage('Shut down the Rush watcher.');
      } catch {
        vscode.window.showErrorMessage('Failed to shut down the Rush watcher.');
        // Swallow error.
      }
    }

    isWatching = false;

    vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');
  });

  context.subscriptions.push(disableWatchCommand);

  const rushRushActionCommand = vscode.commands.registerCommand(
    'rush.runAction',
    async (commandContext: Command) => {
      const projects = projectDataProvider.getActiveProjects();

      if (!(commandContext instanceof Command)) {
        return;
      }

      let rushTerminal: vscode.Terminal | undefined;

      for (const terminal of vscode.window.terminals) {
        if (terminal.name === 'Rush') {
          rushTerminal = terminal;
          break;
        }
      }

      if (!rushTerminal) {
        rushTerminal = vscode.window.createTerminal('Rush');
      }

      const commandText = ['rush '];
      commandText.push(commandContext.label);

      if (projects.length > 0) {
        for (const project of projects) {
          commandText.push(` -t ${project.rushProject.packageName}`);
        }
      }

      rushTerminal.sendText(commandText.join(''));
    }
  );

  context.subscriptions.push(rushRushActionCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
