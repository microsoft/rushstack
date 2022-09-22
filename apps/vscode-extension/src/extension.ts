// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { RushConfigurationProject } from '@rushstack/rush-sdk';
import * as vscode from 'vscode';
import {
  ProjectDataProvider,
  Project,
  StateGroup,
  OperationPhase
} from './dataProviders/projects/ProjectDataProvider';
import * as path from 'path';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  let isWatching = false;

  vscode.commands.executeCommand('setContext', 'rush.watching', isWatching);

  const projectDataProvider = new ProjectDataProvider(workspaceRoot);

  const projectView = vscode.window.createTreeView('rushProjects', {
    treeDataProvider: projectDataProvider,
    canSelectMany: true,
    showCollapseAll: true
  });

  context.subscriptions.push(projectView);

  const openProjectCommand = vscode.commands.registerCommand(
    'rush.openProject',
    (project: Project | StateGroup | OperationPhase) => {
      if (project instanceof Project) {
        vscode.window.showTextDocument(
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

  const toggleActiveProjectCommand = vscode.commands.registerCommand(
    'rush.toggleActiveProject',
    async (
      contextProject: Project | StateGroup | OperationPhase,
      selectedProjects: (Project | StateGroup | OperationPhase)[] = [contextProject]
    ) => {
      if (contextProject instanceof Project) {
        await projectDataProvider.toggleActiveProjects(selectedProjects as Project[]);
      }
    }
  );

  context.subscriptions.push(toggleActiveProjectCommand);

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

  const buildActiveProjectsCommand = vscode.commands.registerCommand('rush.buildActiveProjects', () => {
    const projects = projectDataProvider.getActiveProjects();

    if (projects.length > 0) {
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

      const commandText = ['rush build'];

      for (const project of projects) {
        commandText.push(` -t ${project.rushProject.packageName}`);
      }

      rushTerminal.sendText(commandText.join(''));
    }
  });

  context.subscriptions.push(buildActiveProjectsCommand);

  const enableWatchCommand = vscode.commands.registerCommand('rush.enableWatch', () => {
    isWatching = true;

    vscode.commands.executeCommand('setContext', 'rush.watching', isWatching);
  });

  context.subscriptions.push(enableWatchCommand);

  const disableWatchCommand = vscode.commands.registerCommand('rush.disableWatch', () => {
    isWatching = false;

    vscode.commands.executeCommand('setContext', 'rush.watching', isWatching);
  });

  context.subscriptions.push(disableWatchCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
