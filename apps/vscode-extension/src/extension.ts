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

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

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
      if (project.resourceUri) {
        vscode.window.showTextDocument(project.resourceUri);
      }
    }
  );

  context.subscriptions.push(openProjectCommand);

  function updateContexts(): void {
    const activeProjects = projectDataProvider.getActiveProjects();

    const activeProjectsContext: { [key: string]: true } = {};

    for (const activeProject of activeProjects) {
      activeProjectsContext[activeProject.resourceUri?.toString() ?? ''] = true;
    }

    vscode.commands.executeCommand('setContext', 'rush.canBuild', activeProjects.length > 0);

    vscode.commands.executeCommand('setContext', 'rush.activeProjects', activeProjectsContext);
  }

  const toggleActiveProjectCommand = vscode.commands.registerCommand(
    'rush.toggleActiveProject',
    async (
      contextProject: Project | StateGroup | OperationPhase,
      selectedProjects: (Project | StateGroup | OperationPhase)[] = [contextProject]
    ) => {
      if (contextProject instanceof Project) {
        await projectDataProvider.toggleActiveProjects(selectedProjects as Project[]);

        updateContexts();
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

        updateContexts();
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

        updateContexts();
      }
    }
  );

  context.subscriptions.push(deactivateProjectCommand);

  const buildActiveProjectsCommand = vscode.commands.registerCommand('rush.buildActiveProjects', () => {
    const projects = projectDataProvider.getActiveProjects();

    if (projects.length > 0) {
      const commandText = ['rush build -t'];

      for (const project of projects) {
        commandText.push(` ${project.rushProject.packageName}`);
      }

      vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
        text: `${commandText.join('')}\n`
      });
    }
  });

  context.subscriptions.push(buildActiveProjectsCommand);

  updateContexts();
}

// this method is called when your extension is deactivated
export function deactivate() {}
