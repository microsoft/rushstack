// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import type * as Rush from '@rushstack/rush-sdk';
import type * as RushLib from '@microsoft/rush-lib';
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

  let worker: Rush.IPhasedCommandWorkerController | undefined;

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = {
    command: 'rush.disableWatch',
    title: 'Disable watch'
  };

  context.subscriptions.push(statusBarItem);

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

  async function updateWorker(): Promise<void> {
    if (!worker) {
      return;
    }

    statusBarItem.text = `$(sync~spin) Rush: detecting changes`;

    await worker.abortAsync();

    const activeProjects = projectDataProvider.getActiveProjects();

    const activeProjectNames = new Set(
      activeProjects.map((project: Project) => project.rushProject.packageName)
    );

    const graph = await worker.getGraphAsync();

    const activeOperations = graph.filter(
      (operation: Rush.ITransferableOperation) =>
        !!operation.project && activeProjectNames.has(operation.project)
    );

    let statuses: Rush.ITransferableOperationStatus[] = [];

    const command = commandProvider.getWatchAction();

    if (activeOperations.length > 0) {
      statuses = await worker.updateAsync(activeOperations);

      statusBarItem.text = `$(sync~spin) Rush: executing ${command?.label}`;

      (async () => {
        // TODO Set this when the worker is done.
        await worker.readyAsync();

        statusBarItem.text = `$(sync~spin) Rush: executing ${command?.label}`;
      })();
    }

    projectDataProvider.updateProjectPhases([
      ...graph.map((operation: Rush.ITransferableOperation) => {
        return {
          operation,
          status: 'NO OP' as Rush.OperationStatus,
          duration: 0,
          hash: ''
        };
      }),
      ...statuses
    ]);
  }

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
        projectDataProvider.toggleActiveProjects(selectedProjects as Project[], true);
      } else if (contextProject instanceof StateGroup) {
        if (contextProject.groupName === 'Included' || contextProject.groupName === 'Available') {
          projectDataProvider.toggleActiveProjects(Array.from(contextProject.projects), true);
        }
      }

      await updateWorker();
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
        projectDataProvider.toggleActiveProjects(selectedProjects as Project[], false);
      } else if (contextProject instanceof StateGroup) {
        if (contextProject.groupName === 'Active') {
          projectDataProvider.toggleActiveProjects(Array.from(contextProject.projects), false);
        }
      }

      await updateWorker();
    }
  );

  context.subscriptions.push(deactivateProjectCommand);

  const enableWatchCommand = vscode.commands.registerCommand('rush.enableWatch', async () => {
    const rush = await loadRush();

    const command = commandProvider.getWatchAction();

    if (!command) {
      return;
    }

    vscode.window.showInformationMessage('Initializing the Rush watcher.');
    vscode.commands.executeCommand('setContext', 'rush.watcher', 'starting');

    statusBarItem.text = `$(sync~spin) Rush: initializing watcher`;
    statusBarItem.show();

    worker = rush.createPhasedCommandWorker(['--debug', command.label], {
      cwd: workspaceRoot,
      onStatusUpdate: (operationStatus: Rush.ITransferableOperationStatus) => {
        projectDataProvider.updateProjectPhases([operationStatus]);
      }
    });

    try {
      await updateWorker();

      statusBarItem.text = `$(eye) Rush: watching ${command.label}`;

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
      statusBarItem.text = `$(sync~spin) Rush: shutting down watcher`;

      vscode.window.showInformationMessage('Shutting down the Rush watcher.');
      try {
        await worker.shutdownAsync();
        vscode.window.showInformationMessage('Shut down the Rush watcher.');
      } catch {
        vscode.window.showErrorMessage('Failed to shut down the Rush watcher.');
        // Swallow error.
      }
    }

    statusBarItem.hide();

    vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');
  });

  context.subscriptions.push(disableWatchCommand);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (e: vscode.TextDocument) => {
      await updateWorker();
    })
  );

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

  const setAsWatchActionCommand = vscode.commands.registerCommand(
    'rush.setWatchAction',
    async (commandContext: Command | undefined) => {
      commandProvider.setWatchAction(commandContext);

      if (worker) {
        await vscode.commands.executeCommand('rush.disableWatch');
        await vscode.commands.executeCommand('rush.enableWatch');
      }
    }
  );

  context.subscriptions.push(setAsWatchActionCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
