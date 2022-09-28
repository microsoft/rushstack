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

export async function activate(extensionContext: vscode.ExtensionContext) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  vscode.commands.executeCommand('setContext', 'rush.enabled', false);

  if (!workspaceRoot) {
    return;
  }

  const useWorkspaceRushVersion =
    vscode.workspace.getConfiguration().get<boolean>('rush.useWorkspaceRushVersion') ?? true;

  if (useWorkspaceRushVersion) {
    global.___rush___workingDirectory = workspaceRoot;
  } else {
    global.___rush___rushLibModule = await import('@microsoft/rush-lib');
  }

  const rush = await import('@rushstack/rush-sdk');

  if (!rush.RushCommandLineParser || !rush.PhasedCommandWorkerController) {
    // This version of Rush is not supported by VS Code.
    return;
  }

  let worker: Rush.PhasedCommandWorkerController | undefined;

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = {
    command: 'rush.disableWatch',
    title: 'Disable watch'
  };

  extensionContext.subscriptions.push(statusBarItem);

  const rushDiagnostics = vscode.languages.createDiagnosticCollection('rush');
  extensionContext.subscriptions.push(rushDiagnostics);

  vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');

  function updateWorker(): void {
    if (!worker) {
      return;
    }

    rushDiagnostics.clear();

    const activeProjects = projectDataProvider.getActiveProjects();

    const activeProjectNames = new Set(
      activeProjects.map((project: Project) => project.rushProject.packageName)
    );

    const graph = worker.getGraph();

    const activeOperations = graph.filter(
      (operation: Rush.ITransferableOperation) =>
        !!operation.project && activeProjectNames.has(operation.project)
    );

    worker.update(activeOperations);
  }

  const projectDataProvider = new ProjectDataProvider({
    workspaceRoot,
    rush,
    extensionContext: extensionContext
  });

  const projectView = vscode.window.createTreeView('rushProjects', {
    treeDataProvider: projectDataProvider,
    canSelectMany: true,
    showCollapseAll: true
  });

  extensionContext.subscriptions.push(projectView);

  const commandDataProvider = new CommandDataProvider({
    workspaceRoot,
    rush,
    extensionContext: extensionContext
  });

  const commandView = vscode.window.createTreeView('rushCommands', {
    treeDataProvider: commandDataProvider,
    canSelectMany: false,
    showCollapseAll: false
  });

  extensionContext.subscriptions.push(commandView);

  const decorationProvider = vscode.window.registerFileDecorationProvider(projectDataProvider);

  extensionContext.subscriptions.push(decorationProvider);

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

  extensionContext.subscriptions.push(openProjectCommand);

  const activeProjectForResourceCommand = vscode.commands.registerCommand(
    'rush.activateProjectForResource',
    async (resource: vscode.Uri) => {
      const project = projectDataProvider.getProjectForResource(resource);

      if (project) {
        await projectDataProvider.toggleActiveProjects([project], true);
        updateWorker();
      }
    }
  );

  extensionContext.subscriptions.push(activeProjectForResourceCommand);

  const refreshProjectsCommand = vscode.commands.registerCommand('rush.refreshProjects', async () => {
    await projectDataProvider.refresh();
  });

  extensionContext.subscriptions.push(refreshProjectsCommand);

  const refreshActionsCommand = vscode.commands.registerCommand('rush.refreshActions', async () => {
    await commandDataProvider.refresh();
  });

  extensionContext.subscriptions.push(refreshActionsCommand);

  const activateProjectCommand = vscode.commands.registerCommand(
    'rush.activateProject',
    async (
      contextProject: Project | StateGroup | OperationPhase,
      selectedProjects: (Project | StateGroup | OperationPhase)[] = [contextProject]
    ) => {
      if (contextProject instanceof Project) {
        await projectDataProvider.toggleActiveProjects(selectedProjects as Project[], true);
      } else if (contextProject instanceof StateGroup) {
        if (contextProject.groupName === 'Included' || contextProject.groupName === 'Available') {
          await projectDataProvider.toggleActiveProjects(Array.from(contextProject.projects), true);
        }
      }

      updateWorker();
    }
  );

  extensionContext.subscriptions.push(activateProjectCommand);

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

      updateWorker();
    }
  );

  extensionContext.subscriptions.push(deactivateProjectCommand);

  const enableWatchCommand = vscode.commands.registerCommand('rush.enableWatch', async () => {
    const command = commandDataProvider.getWatchAction();

    if (!command) {
      return;
    }

    vscode.window.showInformationMessage('Initializing the Rush watcher.');
    vscode.commands.executeCommand('setContext', 'rush.watcher', 'starting');

    statusBarItem.text = `$(sync~spin) Rush: initializing watcher`;
    statusBarItem.show();

    worker = new rush.PhasedCommandWorkerController(['--debug', command.label], {
      cwd: workspaceRoot,
      onStatusUpdates: (statuses: Rush.ITransferableOperationStatus[]) => {
        projectDataProvider.updateProjectPhases(statuses);
        if (worker?.state === 'executing') {
          const { activeOperationCount, pendingOperationCount } = worker;
          statusBarItem.text = `$(sync~spin) Rush: running ${command.label} (${
            activeOperationCount - pendingOperationCount
          }/${activeOperationCount})`;
        }

        const diagnosticsByPath: Map<string, vscode.Diagnostic[]> = new Map();
        for (const { diagnostics } of statuses) {
          if (diagnostics?.length) {
            for (const { file, line, column, message, severity, tag } of diagnostics) {
              let collection = diagnosticsByPath.get(file);
              if (!collection) {
                diagnosticsByPath.set(file, (collection = []));
              }
              const diagnostic = new vscode.Diagnostic(
                new vscode.Range(line - 1, column - 1, line - 1, column),
                `${tag} ${message}`,
                severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
              );
              collection.push(diagnostic);
            }
          }
        }

        for (const [file, diagnostics] of diagnosticsByPath) {
          rushDiagnostics.set(vscode.Uri.file(`${workspaceRoot}/${file}`), diagnostics);
        }
      },
      onStateChanged: (state: Rush.PhasedCommandWorkerState) => {
        switch (state) {
          case 'initializing':
            statusBarItem.text = `$(sync~spin) Rush: initializing watcher`;
            statusBarItem.show();
            break;
          case 'updating':
            statusBarItem.text = `$(sync~spin) Rush: detecting changes`;
            break;
          case 'waiting':
            statusBarItem.text = `$(eye) Rush: watching ${command.label}`;
            break;
          case 'executing':
            const { activeOperationCount, pendingOperationCount } = worker!;
            statusBarItem.text = `$(sync~spin) Rush: running ${command.label} (${
              activeOperationCount - pendingOperationCount
            }/${activeOperationCount})`;
            break;
          case 'exiting':
            statusBarItem.text = `$(sync~spin) Rush: shutting down watcher`;
            break;
          case 'exited':
            statusBarItem.hide();
            break;
        }
      }
    });

    try {
      const graph: Rush.ITransferableOperation[] = await worker.getGraphAsync();

      console.log(`Graph: `, graph);
      projectDataProvider.updateProjectPhases(
        graph.map((operation: Rush.ITransferableOperation) => {
          return {
            operation,
            status: 'NO OP' as Rush.OperationStatus,
            duration: 0,
            hash: '',
            active: false
          };
        })
      );
      updateWorker();

      vscode.window.showInformationMessage('Initialized the Rush watcher.');
      vscode.commands.executeCommand('setContext', 'rush.watcher', 'ready');
    } catch {
      vscode.window.showErrorMessage('Failed to initialize the Rush watcher.');
      vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');
      worker.shutdownAsync(true);
    }
  });

  extensionContext.subscriptions.push(enableWatchCommand);

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

    statusBarItem.hide();

    vscode.commands.executeCommand('setContext', 'rush.watcher', 'sleep');
  });

  extensionContext.subscriptions.push(disableWatchCommand);

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

  extensionContext.subscriptions.push(rushRushActionCommand);

  const setAsWatchActionCommand = vscode.commands.registerCommand(
    'rush.setWatchAction',
    async (commandContext: Command | undefined) => {
      commandDataProvider.setWatchAction(commandContext);

      if (worker) {
        await vscode.commands.executeCommand('rush.disableWatch');
        await vscode.commands.executeCommand('rush.enableWatch');
      }
    }
  );

  extensionContext.subscriptions.push(setAsWatchActionCommand);

  extensionContext.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
      updateWorker();
    })
  );

  await Promise.all([projectDataProvider.refresh(), commandDataProvider.refresh()]);
}

// this method is called when your extension is deactivated
export function deactivate() {}
